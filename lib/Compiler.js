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
        'var ' + ['eval', 'Object', 'Function', 'Array', 'String', 'Boolean', 'Number', 'Date', 'RegExp', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'].join(' = ') + ' = undefined',
        this.context,
        'gbasm'
    );

}

Compiler.prototype = {

    compile: function(files) {
        var that = this;
        files.forEach(function(file) {
            that.include(null, path.join(that.base, file), 0, 0, 0);
        });
    },

    link: function() {
        this.files.forEach(function(file) {
            file.link();
        });
    },

    include: function(parent, file, offset, line, col) {
        var sourceFile = new SourceFile(this, parent, file, offset, line, col);
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
                        return resolved.value;

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
                throw new TypeError('Unresolved ' + value.type);
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


    // Getters ----------------------------------------------------------------
    getRomSize: function() {

        return this.files.map(function(file) {
            return file.getRomSize();

        }).sort(function(a, b) {
            return b - a;

        })[0] || 0x8000; // Minimum ROM size is 32kbyte

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
        console.log(file.getPath().blue, message);
    }

};


// Exports --------------------------------------------------------------------
module.exports = Compiler;

