// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var path = require('path'),
    SourceFile = require('./SourceFile'),
    vm = require('vm');

require('colors');


// Assembly Code Compiler -----------------------------------------------------
// ----------------------------------------------------------------------------
function Compiler() {

    this.files = [];
    this.base = process.cwd();

    // Create Expression evaluation context
    this.context = vm.createContext({});

    vm.runInContext(
        'var ' + [
            'eval', 'Object', 'Function', 'Array', 'String', 'Boolean',
            'Number', 'Date', 'RegExp', 'Error', 'EvalError', 'RangeError',
            'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'
        ].join(' = ') + ' = undefined',
        this.context,
        'gbasm'
    );

}

Compiler.prototype = {

    // API --------------------------------------------------------------------
    compile: function(files) {
        var that = this;
        files.forEach(function(file) {
            that.include(null, path.join(that.base, file), 0, null, 0, 0);
        });
    },

    link: function() {
        this.files.forEach(function(file) {
            file.link();
        });
    },

    optimize: function() {
        this.files.forEach(function(file) {
            file.optimize();
        });
        this.link();
    },

    generate: function() {

        var size = this.getRomSize(),
            buffer = new Buffer(size);

        for(var i = 0; i < size; i++) {
            buffer[i] = 0;
        }

        this.files.forEach(function(file) {
            file.generate(buffer);
        });

        this.fixChecksums(buffer);

        // Pad if ROM size in header is bigger than required size
        var headerSize = this.getRomSizeFromHeader(buffer);
        if (headerSize > size) {

            var paddingSize = headerSize - size,
                paddingBuffer = new Buffer(paddingSize);

            for(i = 0; i < paddingSize; i++) {
                paddingBuffer[i] = 0;
            }

            buffer = Buffer.concat([buffer, paddingBuffer]);

        }

        return buffer;

    },

    symbols: function() {

        var symbols = [];

        this.files.forEach(function(file) {
            symbols.push.apply(symbols, file.symbols());
        });

        symbols.sort(function(a, b) {
            return a.offset - b.offset;
        });

        return symbols.map(function(s) {

            //if (s.section.name === 'ROMX') {
                // TODO generate bank number
            //}
            var name = s.parent ? s.parent.name + '.' + s.name : s.name;
            return '00:' + padHexValue(s.offset, 4, '0') + ' ' + name;

        }).join('\n');

    },


    // Internals --------------------------------------------------------------
    include: function(parent, file, offset, section, line, col) {
        var sourceFile = new SourceFile(this, parent, file, offset, section, line, col);
        this.files.push(sourceFile);
        sourceFile.parse();
        return sourceFile;
    },

    resolve: function(sourceFile, value, sourceOffset, sourceLine, sourceCol, relativeOffset) {

        var that = this,
            resolved = null;

        switch(value.type) {
            case 'NUMBER':
            case 'STRING':
                return value.value;

            case 'EXPRESSION':

                // Resolve all parts of the expression and convert it into
                // a string
                var expression = value.value.map(function(item) {
                    switch(item.type) {
                        case 'OPERATOR':
                        case 'LPAREN':
                        case 'RPAREN':
                        case 'NUMBER':
                            return item.value;

                        case 'STRING':
                            return '"' + item.value + '"';

                        default:
                            return that.resolve(sourceFile, item, sourceOffset, item.line, item.col, false);
                    }

                }).join(' ');

                // Evaluate the converted JS string
                // TODO support macro functions
                try {
                    resolved = vm.runInContext(expression, this.context, 'gbasm');

                } catch(e) {
                    sourceFile.resolveError(
                        'Failed to evaluate expression',
                        'Invalid syntax.',
                        sourceLine, sourceCol
                    );
                }

                return resolved;

            case 'NAME':
                resolved = this.resolveName(value.value);
                if (resolved) {

                    if (resolved.hasOwnProperty('value')) {

                        // Recursively resolve values
                        // TODO detect circular references
                        // TODO push to reference stack and provide better error messages
                        // TODO something like "failed to ... referenced from .. line .. col .."
                        if (typeof resolved.value === 'object') {
                            return this.resolve(sourceFile, resolved.value, sourceOffset, sourceLine, sourceCol, relativeOffset);

                        } else {
                            return resolved.value;
                        }

                    } else if (resolved.hasOwnProperty('offset')) {
                        if (relativeOffset) {
                            return resolved.offset - sourceOffset;

                        } else {
                            return resolved.offset;
                        }

                    } else {
                        throw new TypeError('Resolved name has neither value nor offset.');
                    }

                } else {
                    sourceFile.resolveError(
                        'Failed to resolve name',
                        '"' + value.value + '" was not declared',
                        sourceLine, sourceCol
                    );
                }
                break;

            case 'OFFSET':
                return relativeOffset ? value.value : sourceOffset + value.value;

            case 'LABEL_LOCAL_REF':
                resolved = sourceFile.resolveLocalLabel(value);
                if (resolved) {

                    if (relativeOffset) {
                        return resolved.offset - sourceOffset;

                    } else {
                        return resolved.offset;
                    }

                } else {
                    throw new TypeError('Failed to resolve local label reference.');
                }
                break;

            default:
                throw new TypeError('Unresolved ' + value);
        }

    },

    resolveName: function(name) {

        for(var i = 0, l = this.files.length; i < l; i++) {

            var file = this.files[i],
                value = file.resolveName(name);

            if (value) {
                return value;
            }

        }

        return null;

    },

    fixChecksums: function(buffer) {

        // Header
        var checksum = 0, i;
        for(i = 0x134; i < 0x14D; i++) {
            checksum = (((checksum - buffer[i]) & 0xff) - 1) & 0xff;
        }

        buffer[0x14D] = checksum;

        // Full ROM
        checksum = 0;
        for(i = 0; i < buffer.length; i++) {
            if (i !== 0x14E && i !== 0x14F) {
                checksum += buffer[i];
            }
        }

        buffer[0x14E] = (checksum >> 8) & 0xff;
        buffer[0x14F] = checksum & 0xff;

    },

    fixHeader: function() {
        // TODO insert nintendo checklogo and other things here
    },


    // Getters ----------------------------------------------------------------
    getRomSize: function() {

        return this.files.map(function(file) {
            return file.getRomSize();

        }).sort(function(a, b) {
            return b - a;

        })[0] || 0x8000; // Minimum ROM size is 32kbyte

    },

    getRomSizeFromHeader: function(buffer) {

        var size = buffer[0x148];
        return {
            0x00: 0x8000,
            0x01: 0x10000,
            0x02: 0x20000,
            0x03: 0x40000,
            0x04: 0x80000,
            0x05: 0x100000,
            0x06: 0x200000

        }[size];

    },


    // Error Handling and Logging ---------------------------------------------
    error: function(file, line, col, message) {
        console.error(('In ' + file.getPath(line, col)).yellow + '\n  ' + message.red);
        process.exit(1);
    },

    warning: function(file, message) {
        console.error(file.getPath().gray + ' ' + message.yellow);
    },

    log: function(file, message) {
        console.log(file.getPath(undefined, undefined, true).blue, message);
    }

};


// Helpers --------------------------------------------------------------------
function padHexValue(value, size, pad) {
    var s = value.toString(16).toUpperCase();
    return new Array((size + 1) - s.length).join(pad) + s;
}


// Exports --------------------------------------------------------------------
module.exports = Compiler;

