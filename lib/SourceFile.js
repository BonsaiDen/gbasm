// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path'),
    Parser = require('./parser/Parser');


// Assembly Source File Abstraction -------------------------------------------
// ----------------------------------------------------------------------------
function SourceFile(compiler, parent, file, offset, line, col) {

    this.compiler = compiler;
    this.name = file.substring(compiler.base.length + 1);
    this.parent = parent;
    this.parentLine = line;
    this.parentCol = col;
    this.path = file;

    // Data
    this.source = fs.readFileSync(this.path).toString();
    this.size = 0;
    this.offset = offset;

    // Code
    this.instructions = [];
    this.includes = [];
    this.sections = [];
    this.labels = [];
    this.variables = [];
    this.constants = [];
    this.datas = [];

}

SourceFile.prototype = {

    parse: function() {

        var start = Date.now();

        this.parser = new Parser(this);
        this.log('Tokenized in ' + (Date.now() - start) + 'ms');

        this.parser.parse();
        this.log('Parsed in ' + (Date.now() - start) + 'ms');

        //console.log(this.sections);
        //console.log(this.labels);
        //console.log(this.variables);
        //console.log(this.constants);
        //console.log(this.instructions);

    },

    link: function() {

        var that = this;
        this.instructions.forEach(function(instr) {
            if (instr.arg) {

                // Resolve the value of the instructions argument
                var value = that.compiler.resolve(
                    that,
                    instr.arg,
                    instr.offset,
                    instr.line,
                    instr.col,
                    instr.mnemonic === 'jr'
                );

                // Check if we could resolve the value
                if (value === null) {
                    that.resolveError(
                        'Unresolved value',
                        '"' + instr.arg.value + '" could not be resolved',
                        instr.line, instr.col
                    );

                // Validate signed argument range
                } else if (instr.isSigned && (value < -127 || value > 128)) {

                    if (instr.mnemonic === 'jr') {
                        that.resolveError(
                            'Invalid relative jump address offset',
                            'Offset is ' + value + ' bytes but must be between -127 and 128 bytes',
                            instr.line, instr.col
                        );

                    } else {
                        that.resolveError(
                            'Invalid value for signed byte argument',
                            'Value is ' + value + ' but must be -127-128',
                            instr.line, instr.col
                        );
                    }

                } else if (instr.isBit && (value < 0 || value > 7)) {
                    that.resolveError(
                        'Invalid bit index argument',
                        'Bit index is ' + value + ' but must be 0-7',
                        instr.line, instr.col
                    );

                } else if (instr.bits === 8 && (value < -127 || value > 255)) {
                    that.resolveError(
                        'Invalid value for byte argument',
                        'Value is ' + value + ' but must be -128-255',
                        instr.line, instr.col
                    );

                } else if (instr.bits === 16 && (value < -32767 || value > 65535)) {
                    if (instr.mnemonic === 'jp' || instr.mnemonic === 'call') {
                        that.resolveError(
                            'Invalid jump address',
                            'address is ' + value + ' but must be 0-65535',
                            instr.line, instr.col
                        );

                    } else {
                        that.resolveError(
                            'Invalid value for word argument',
                            'value is ' + value + ' but must be 0-65535',
                            instr.line, instr.col
                        );
                    }

                // Convert signed values to twos complement
                } else if (value < 0) {
                    if (instr.bits === 8) {
                        value = ((~value + 1) + 255) % 255;

                    } else {
                        value = ((~value + 1) + 65535) % 65535;
                    }
                }

                // Replace arg with resolved value
                instr.arg = value;

            }
        });

        // TODO resolve data values

    },

    resolveLocalLabel: function(localLabel) {

        var i, l, parent = null;

        // go through labels in file exit if label.line > localLabel.line
        // and take last label before that
        for(i = 0, l = this.labels.length; i < l; i++) {

            var label = this.labels[i];
            if (!label.parent) {
                if (label.line > localLabel.line) {
                    break;

                } else {
                    parent = label;
                }
            }

        }

        if (parent) {

            // Now find the first children with the labels name
            for(i = 0, l = parent.children.length; i < l; i++) {
                if (parent.children[i].name === localLabel.value) {
                    return parent.children[i];
                }
            }

        }

        return null;

    },

    resolveName: function(name) {

        var i, l;
        for(i = 0, l = this.labels.length; i < l; i++) {
            if (this.labels[i].name === name) {
                return this.labels[i];
            }
        }

        for(i = 0, l = this.variables.length; i < l; i++) {
            if (this.variables[i].name === name) {
                return this.variables[i];
            }
        }

        for(i = 0, l = this.constants.length; i < l; i++) {
            if (this.constants[i].name === name) {
                return this.constants[i];
            }
        }

        return null;

    },

    list: function() {

        function padr(value, size, pad) {
            var s = value.toString();
            return s + new Array((size + 1) - s.length).join(pad);
        }

        function hex(value, size, pad) {
            var s = value.toString(16).toUpperCase();
            return new Array((size + 1) - s.length).join(pad) + s;
        }

        var lines = this.instructions.map(function(i) {

            var bytes = i[4];
            if (i[5] !== null) {
                if (i[6]) {
                    bytes.push(i[5].value);

                } else {
                    bytes.push(i[5].value & 0xff);
                    bytes.push((i[5].value >> 8) & 0xff);
                }
            }

            return hex(i[1], 4, '0') + ' ' + padr(bytes.map(function(value) {
                return hex(value, 2, '0');

            }).join(' '), 20, ' ') + i[0];

        });

        return lines.join('\n');

    },


    // Parser Interfaces ------------------------------------------------------
    include: function(file, line, col) {

        // Relative includes
        file = path.join(path.dirname(this.path), file);

        // Check for circular includes
        var p = this;
        while(p) {
            if (p.path === file) {
                this.parseError('circular inclusion of "' + this.name + '"', null, line, col);
            }
            p = p.parent;
        }

        // Parse the file
        var includedFile = this.compiler.include(this, file, this.offset, line, col);
        this.includes.push(includedFile);
        this.offset += includedFile.size;

    },

    instruction: function(mnemonic, cycles, code, arg, isByte, isSigned, isBit, line, col) {

        var instr = new Instruction(
            mnemonic, this.offset, cycles,
            code, arg, isByte, isSigned, isBit,
            line, col
        );

        this.instructions.push(instr);
        this.offset += instr.size;
        this.size += instr.size;

    },

    section: function(name, segment, offset) {
        // TODO Validate sections names and sizes
        this.sections.push(new Section(name, segment, offset));
        this.offset = offset;
    },

    variable: function(name, size, line, col) {

        // TODO check for duplicates by resolving the name via the compiler
        var existing = this.compiler.resolveName(name);
        if (existing) {
            console.log('DUPLICATE VARIABEL NAME');
        }

        this.variables.push(new Variable(name, this.offset, size, line, col));
        this.offset += size;

    },

    label: function(name, parent, line, col) {

        // Check for duplicate global lables
        if (!parent) {

            var existing = this.compiler.resolveName(name);
            if (existing) {
                console.log('DUPLICATE GLOBAL LABEL');
            }

        // Check for duplicate local labels
        } else if (parent) {
            for(var i = 0, l = parent.children.length; i < l; i++) {
                if (parent.children[i].name === name) {
                    console.log('DUPLICATE LOCAL LABEL');
                }
            }
        }

        var label = new Label(name, this.offset, parent, line, col);
        this.labels.push(label);
        return label;

    },

    constant: function(name, value, isString, line, col) {

        var existing = this.compiler.resolveName(name);
        if (existing) {
            console.log('DUPLICATE CONSTANT NAME');
        }

        // TODO check for duplicates by resolving the name via the compiler
        this.constants.push(new Constant(name, value, isString, line, col));

    },

    data: function(values, isByte) {

        if (typeof values === 'number') {
            this.offset += values;

        } else {
            var data = new Data(values, this.offset, isByte);
            this.datas.push(data);
            this.offset += data.size;
        }

    },


    // Getters ----------------------------------------------------------------
    getPath: function(line, col) {

        if (this.parent) {
            return '[' + this.name + '] at line ' + line + ', col ' + col + ' (included from ' + this.parent.getPath(this.parentLine, this.parentCol) + ')';

        } else {
            return '[' + this.name + '] at line ' + line + ', col ' + col;
        }

    },

    getRomSize: function() {

        var v = this.sections.filter(function(s) {
            return s.segment === 'ROM0' || s.segment === 'ROMX';

        }).map(function(s) {
            return Math.floor(s.offset / 0x4000);

        }).sort(function(a, b) {
            return b - a;

        })[0] || 1;

        // Get nearest upper power of two
        v |= v >> 1;
        v |= v >> 2;
        v |= v >> 4;
        v |= v >> 8;
        v |= v >> 16;
        v++;

        // Returns 32kb, 64kb, 128kb, 256kb etc.
        return v * 0x4000;

    },


    // Error Handling and Logging ---------------------------------------------
    parseError: function(msg, expected, line, col) {

        var message = 'Unexpected ' + msg;
        message += ' at line ' + line + ', col ' + col;

        if (expected) {
            message += ', expected ' + expected + ' instead';
        }

        message += ':';

        var row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(message + '\n\n    ' + row + '\n    ' + pointer);

    },

    resolveError: function(msg, reason, line, col) {

        var message = msg + '. ';
        message += reason;
        message += ':';

        var row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    error: function(line, col, message) {
        this.compiler.error(this, line, col, message);
    },

    warning: function(line, col, message) {
        this.compiler.warning(this, line, col, message);
    },

    log: function(message) {
        this.compiler.log(this, message);
    }

};


// Classes --------------------------------------------------------------------
function Instruction(mnemonic, offset, cycles, code, arg, isByte, isSigned, isBit, line, col) {
    this.mnemonic = mnemonic;
    this.offset = offset;
    this.size = code.length + (arg ? (isByte ? 1 : 2) : 0);
    this.cycles = cycles;
    this.raw = code;
    this.arg = arg;
    this.bits = isByte ? 8 : 16;
    this.isSigned = !!isSigned;
    this.isBit = !!isBit;
    this.line = line;
    this.col = col;
}

function Section(name, segment, offset) {
    this.name = name;
    this.segment = segment;
    this.offset = offset;
}

function Variable(name, offset, size, line, col) {
    this.name = name;
    this.offset = offset;
    this.size = size;
    this.line = line;
    this.col = col;
}

function Label(name, offset, parent, line, col) {

    this.name = name;
    this.offset = offset;
    this.parent = parent;
    this.children = [];
    this.isLocal = !!parent;
    this.line = line;
    this.col = col;

    if (this.parent) {
        this.parent.children.push(this);
    }

}

function Constant(name, value, isString, line, col) {
    this.name = name;
    this.value = value;
    this.isString = isString;
    this.line = line;
    this.col = col;
}

function Data(values, offset, isByte) {
    this.values = values;
    this.offset = offset;
    this.size = values.length * (isByte ? 1 : 2);
    this.bits = isByte ? 8 : 16;
}


// Exports --------------------------------------------------------------------
module.exports = SourceFile;

