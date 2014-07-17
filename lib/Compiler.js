// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var path = require('path'),
    vm = require('vm'),

    SourceFile = require('./SourceFile'),
    Cartridge = require('./Cartridge'),
    Macro = require('./Macro');

require('colors');


// Assembly Code Compiler -----------------------------------------------------
// ----------------------------------------------------------------------------
function Compiler() {
    this.files = [];
    this.context = null;
    this.base = '',
    this.reset();
}

Compiler.prototype = {

    // API --------------------------------------------------------------------
    compile: function(files) {

        var that = this,
            start = Date.now();

        this.base = path.join(process.cwd(), path.dirname(files[0]));

        files.forEach(function(file) {
            that.include(null, path.join(process.cwd(), file), 0, null, 0, 0);
        });

        this.log(null, 'Parsed ' + this.files.length + ' file(s) in ' + (Date.now() - start) + 'ms');
        this.link(true);

        this.log(null, 'Linked ' + this.files.length + ' file(s) in ' + (Date.now() - start) + 'ms');

        this.sortSections();

    },

    sortSections: function() {

        var segmentIndex = {
            ROM0: 0,
            ROMX: 1,
            WRAM0: 2,
            WRAMX: 3,
            HRAM: 4
        };

        var sections = this.getSections();
        sections.sort(function(a, b) {
            if (a.segment === b.segment) {
                if (a.bank === b.bank) {
                    if (a.isOffset && b.isOffset) {
                        return a.offset - b.offset;

                    } else if (a.isOffset) {
                        return -1;

                    } else {
                        return 1;
                    }

                } else {
                    return a.bank - b.bank;
                }

            } else {
                return segmentIndex[a.segment] - segmentIndex[b.segment];
            }
        });

    },

    getSections: function() {

        var sections = [];
        this.files.forEach(function(file) {
            sections.push.apply(sections, file.sections);
        });

        return sections;

    },

    link: function() {

        // Calculate all addresses
        this.files.forEach(function(file) {
            file.address();
        });

        // Now re-arrange the existing section base addresses
        var sections = this.getSections(),
            sectionsLastAddresses = {};

        sections.forEach(function(section) {

            var id = section.segment + '[' + section.bank + ']';
            if (!section.isOffset) {
                section.offset = sectionsLastAddresses[id] || section.offset;
                section.calculateOffsets();
            }

            sectionsLastAddresses[id] = section.offset + section.size;

        });


        // Link with the calculated addresses
        this.files.forEach(function(file) {
            file.link();
        });

    },

    optimize: function() {

        // Optimize instructions
        this.files.forEach(function(file) {
            file.optimize();
        });

        // We need to relink now since instruction sizes / address might have
        // changed
        this.link();

    },

    generate: function() {

        var size = this.getMinimumRomSize(),
            buffer = new Buffer(size),
            header;


        // Clear all bytes in the rom
        for(var i = 0; i < size; i++) {
            buffer[i] = 0;
        }


        // Generate Code and Data
        this.files.forEach(function(file) {
            file.generate(buffer);
        });


        // Get Cartridge Informatio and Validate
        header = Cartridge.parseRomHeader(this, buffer);

        // Pad if ROM size in header is bigger than required size
        if (header.rom.size > size) {

            this.log(null, 'Generated ROM is smaller than size specified in header, padding.');

            var paddingSize = header.rom.size - size,
                paddingBuffer = new Buffer(paddingSize);

            for(i = 0; i < paddingSize; i++) {
                paddingBuffer[i] = 0;
            }

            buffer = Buffer.concat([buffer, paddingBuffer]);

        } else if (size > header.rom.size) {
            this.warning(null, 'ROM size in header is smaller then the required size to generate.');
        }

        this.log(null, 'Title: ' + header.title);
        this.log(null,  'Mapper: ' + header.type.Mapper);
        this.log(null,  'ROM: ' + header.rom.size + ' bytes in ' + header.rom.banks + ' bank(s)');
        this.log(null,  'RAM: ' + header.ram.size + ' bytes in ' + header.ram.banks + ' bank(s)');
        this.log(null,  'BATTERY: ' + (header.type.Battery ? 'yes' : 'no'));

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
            var name = s.parent ? s.parent.name + s.name : s.name;
            return padHexValue(s.section.bank, 2, '0') + ':' + padHexValue(s.offset, 4, '0') + ' ' + name;

        }).join('\n');

    },

    reset: function() {

        this.files = [];

        // Create a expression evaluation context
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

        // Define Macros
        Macro.defineMacros(this.context);

    },


    // Internals --------------------------------------------------------------
    include: function(parent, file, section, index) {
        var sourceFile = new SourceFile(this, parent, file, section, index);
        this.files.push(sourceFile);
        sourceFile.parse();
        return sourceFile;
    },

    resolve: function(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack) {

        // Keep track and error on circular references
        stack = stack || [];

        if (stack.indexOf(value) !== -1) {
            // TODO clean up error formatting
            stack[0].file.resolveError(
                'Circular reference detected while resolving value',
                '"'  + stack[0].value + '" points at itself via ' + stack.slice(1).reverse().map(function(s) {
                    return s.value + ' in ' + s.file.getPath();

                }).join(' -> '),
                stack[0].index
            );

        } else {

            if (value.file === null) {
                value.file = sourceFile;
            }

            stack.push(value);

        }

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
                            var resolved = that.resolve(sourceFile, item, sourceOffset, item.index, false, stack);
                            if (resolved instanceof Macro) {
                                return resolved.name;

                            } else if (typeof resolved === 'string') {
                                return '"' + resolved + '"';

                            } else {
                                return resolved;
                            }
                    }

                }).join(' ');

                // Evaluate the converted JS string
                try {
                    resolved = vm.runInContext(expression, this.context, 'gbasm');

                    // Round everything down
                    if (typeof resolved === 'number') {
                        resolved = Math.floor(resolved);
                    }

                } catch(e) {
                    sourceFile.resolveError(
                        'Failed to evaluate expression',
                        'Invalid syntax',
                        sourceIndex
                    );
                }

                return resolved;

            case 'NAME':
                resolved = this.resolveName(value.value);
                if (resolved) {

                    // Recursively resolve values
                    if (resolved.hasOwnProperty('value')) {
                        if (typeof resolved.value === 'object') {
                            return this.resolve(resolved.file, resolved.value, sourceOffset, resolved.value.index, relativeOffset, stack);

                        } else {
                            return resolved.value;
                        }

                    } else if (resolved.hasOwnProperty('offset')) {
                        if (relativeOffset) {
                            return resolved.offset - sourceOffset;

                        } else {
                            return resolved.offset;
                        }

                    } else if (resolved instanceof Macro) {
                        return resolved;
                    }

                } else {
                    // TODO Show the reference path
                    value.file.resolveError(
                        'Failed to resolve name',
                        '"' + value.value + '" was not declared',
                        value.index
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
                    value.file.resolveError(
                        'Unresolved local label "' + value.value + '"',
                        'Definition could not be found in current scope',
                        value.index
                    );
                }
                break;

            default:
                throw new TypeError('Unresolved ' + value);
        }

    },

    resolveName: function(name) {

        if (Macro.Defined.hasOwnProperty(name)) {
            return Macro.Defined[name];
        }

        for(var i = 0, l = this.files.length; i < l; i++) {

            var file = this.files[i],
                value = file.resolveName(name);

            if (value) {
                value.file = file;
                return value;
            }

        }

        return null;

    },

    resolveSectionBySignature: function(signature) {

        for(var i = 0, l = this.files.length; i < l; i++) {

            var file = this.files[i],
                section = file.resolveSectionBySignature(signature);

            if (section) {
                return section;
            }

        }

        return null;

    },


    // Getters ----------------------------------------------------------------
    getMinimumRomSize: function() {

        return this.files.map(function(file) {
            return file.getMinimumRomSize();

        }).sort(function(a, b) {
            return b - a;

        })[0] || 0x8000; // Minimum ROM size is 32kbyte

    },


    // Error Handling and Logging ---------------------------------------------
    error: function(file, index, message) {
        console.error(('In ' + file.getPath(index)).yellow + '\n  ' + message.red);
        process.exit(1);
    },

    warning: function(file, index, message) {
        file = file ? file.getPath(index, true).orange : '[Warning]';
        console.warn(file.getPath().orange + ' ' + message.yellow);
    },

    log: function(file, message) {
        file = file ? file.getPath(undefined, undefined, true): '[Info]';
        console.log(file.blue, message);
    }

};


// Helpers --------------------------------------------------------------------
function padHexValue(value, size, pad) {
    var s = value.toString(16).toUpperCase();
    return new Array((size + 1) - s.length).join(pad) + s;
}


// Exports --------------------------------------------------------------------
module.exports = Compiler;

