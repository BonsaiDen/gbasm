// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path'),
    Parser = require('./parser/Parser'),
    optimize = require('./Optimizer'),

    Section = require('./data/Section'),
    Label = require('./data/Label'),
    Constant = require('./data/Constant'),
    Variable = require('./data/Variable'),
    Data = require('./data/Data'),
    Binary = require('./data/Binary'),
    Instruction = require('./data/Instruction');


// Assembly Source File Abstraction -------------------------------------------
// ----------------------------------------------------------------------------
function SourceFile(compiler, parent, file, section, line, col) {

    this.compiler = compiler;
    this.name = file.substring(compiler.base.length + 1);
    this.parent = parent;
    this.parentLine = line;
    this.parentCol = col;
    this.path = file;

    // Data
    try {
        this.source = fs.readFileSync(this.path).toString();

    } catch(e) {
        // TODO compiler error
        throw new TypeError('File not found');
    }

    this.currentSection = section;

    // Code
    this.instructions = [];
    this.includes = [];
    this.sections = [];
    this.labels = [];
    this.variables = [];
    this.constants = [];
    this.binaries = [];
    this.datas = [];

}

SourceFile.prototype = {

    // API --------------------------------------------------------------------
    parse: function() {
        var start = Date.now();
        this.parser = new Parser(this);
        this.parser.parse();
        this.log('Parsed in ' + (Date.now() - start) + 'ms');
    },

    link: function() {

        var start = Date.now();

        this.sections.forEach(function(section) {
            section.calculateOffsets();
        });

        this.linkInstructions();
        this.linkData();

        this.log('Linked in ' + (Date.now() - start) + 'ms');

    },

    preLink: function() {

        // Resolve final sizes for variables and data
        var that = this;
        this.datas.forEach(function(data) {
            if (typeof data.size === 'object') {
                data.size = that.compiler.resolve(
                    that,
                    data.size,
                    data.offset,
                    data.line,
                    data.col,
                    false
                );
            }
        });

        this.variables.forEach(function(variable) {
            if (typeof variable.size === 'object') {
                variable.size = that.compiler.resolve(
                    that,
                    variable.size,
                    variable.offset,
                    variable.line,
                    variable.col,
                    false
                );
            }
        });

        // Update all offsets in all sections
        this.sections.forEach(function(section) {
            section.calculateOffsets();
        });

        this.assignRelativeJumpTargets();

    },

    optimize: function() {
        this.instructions.forEach(function(instr) {
            optimize(instr);
        });
    },

    generate: function(buffer) {

        this.instructions.forEach(function(instr) {

            var index = instr.offset;
            for(var i = 0; i < instr.raw.length; i++) {
                buffer[index++] = instr.raw[i];
            }

            if (instr.resolvedArg) {
                if (instr.bits === 8) {
                    buffer[index] = instr.resolvedArg;

                } else if (instr.bits === 16) {
                    buffer[index] = instr.resolvedArg & 0xff;
                    buffer[index + 1] = (instr.resolvedArg >> 8) & 0xff;
                }
            }

        });

        this.datas.forEach(function(data) {

            var index = data.offset, i;

            // Empty DS
            if (data.size > data.resolvedValues.length * (data.bits / 8)) {
                for(i = 0; i < data.size; i++) {
                    buffer[index++] = 0;
                }

            // DB / DS
            } else if (data.bits === 8) {
                for(i = 0; i < data.resolvedValues.length; i++) {
                    buffer[index++] = data.resolvedValues[i];
                }

            // DW
            } else if (data.bits === 16) {
                for(i = 0; i < data.resolvedValues.length; i++) {
                    buffer[index++] = data.resolvedValues[i] & 0xff;
                    buffer[index++] = (data.resolvedValues[i] >> 8) & 0xff;
                }
            }

        });

        this.binaries.forEach(function(binary) {

            var index = binary.offset,
                binaryBuffer = binary.getBuffer();

            for(var i = 0; i < binary.size; i++) {
                buffer[index++] = binaryBuffer[i];
            }

        });

    },

    symbols: function() {

        var symbols = [];
        symbols.push.apply(symbols, this.variables.map(function(v) {
            return v;
        }));

        symbols.push.apply(symbols, this.labels.map(function(l) {
            return l;
        }));

        return symbols;

    },


    // Linking ----------------------------------------------------------------
    resolveLocalLabel: function(localLabel) {

        var i, l, parent = null;

        // Find the first global label which sits infront of the target localLabel
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
        var includedFile = this.compiler.include(this, file, this.currentSection, line, col);
        this.includes.push(includedFile);
        this.currentSection = includedFile.currentSection;

    },

    instruction: function(mnemonic, cycles, code, arg, isByte, isSigned, isBit, line, col) {

        if (!this.currentSection) {
            this.sectionError('instruction', line, col);
        }

        this.instructions.push(new Instruction(
            mnemonic, this.currentSection,
            cycles, code, arg, isByte, isSigned, isBit,
            line, col
        ));

    },

    section: function(name, segment, bank, offset) {
        this.currentSection = new Section(this, name, segment, bank, offset);
        this.sections.push(this.currentSection);
    },

    variable: function(name, size, line, col) {

        if (!this.currentSection) {
            this.sectionError('variable', line, col);
        }

        var existing = this.compiler.resolveName(name);
        if (existing) {
            this.defineError(
                'Redefinition of variable "' + name + '"',
                line, col, existing
            );
        }

        this.variables.push(new Variable(this, name, this.currentSection, size, line, col));

    },

    label: function(name, parent, line, col) {

        if (!this.currentSection) {
            this.sectionError('label', line, col);
        }

        // Check for duplicate global lables
        if (!parent) {

            var existing = this.compiler.resolveName(name);
            if (existing) {
                this.defineError(
                    'Redefinition of global label "' + name + '"',
                    line, col, existing
                );
            }

        // Check for duplicate local labels
        } else if (parent) {

            for(var i = 0, l = parent.children.length; i < l; i++) {
                if (parent.children[i].name === name) {
                    this.defineError(
                        'Redefinition of local label "' + name + '"',
                        line, col, parent.children[i]
                    );
                }
            }

        }

        var label = new Label(this, name, this.currentSection, parent, line, col);
        this.labels.push(label);

        return label; // return label for parent label assignments in Parser

    },

    constant: function(name, value, isString, line, col) {

        var existing = this.compiler.resolveName(name);
        if (existing) {
            this.defineError(
                'Redefinition of constant "' + name + '"',
                line, col, existing
            );
        }

        this.constants.push(new Constant(this, name, value, isString, line, col));

    },

    data: function(values, isByte, size, line, col) {

        if (!this.currentSection) {
            this.sectionError('data', line, col);
        }

        this.datas.push(new Data(values, this.currentSection, isByte, size));

    },

    binary: function(src) {
        this.binaries.push(new Binary(this, src.value, this.currentSection));
    },


    // Internal Linking Code --------------------------------------------------
    assignRelativeJumpTargets: function() {

        var that = this;
        this.instructions.forEach(function(instr) {

            if (instr.mnemonic === 'jr' && instr.arg.type === 'OFFSET') {

                var target = that.findInstructionByOffset(instr.offset, instr.arg.value);
                if (!target) {
                    that.resolveError('Invalid jump offset',
                        'Must point at the start of a instruction',
                        instr.line, instr.col
                    );

                } else {
                    instr.arg = target;
                }

            }

        });

    },

    findInstructionByOffset: function(from, offset) {

        // Correct for instruction size
        if (offset < 0) {
            offset -= 1;
        }

        var target = from + offset;
        for(var i = 0; i < this.instructions.length; i++) {
            var instr = this.instructions[i];
            if (instr.offset === target) {
                return instr;
            }
        }

        return null;

    },

    linkInstructions: function() {

        var that = this;
        this.instructions.forEach(function(instr) {

            if (instr.arg) {

                var value;

                // Handle targets of relative jump instructions
                if (instr.arg instanceof Instruction) {
                    value = instr.arg.offset - instr.offset;

                // Resolve the value of the instructions argument
                } else {
                    value = that.compiler.resolve(
                        that,
                        instr.arg,
                        instr.offset,
                        instr.line,
                        instr.col,
                        instr.mnemonic === 'jr'
                    );
                }

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
                            'Address is ' + value + ' but must be 0-65535',
                            instr.line, instr.col
                        );

                    } else {
                        that.resolveError(
                            'Invalid value for word argument',
                            'Value is ' + value + ' but must be -32767-65535',
                            instr.line, instr.col
                        );
                    }

                // Convert signed values to twos complement
                } else if (value < 0) {
                    if (instr.bits === 8) {

                        // Correct jump offsets for relative jumps
                        if (instr.mnemonic === 'jr') {
                            if (value < 0) {
                                value -= 1;
                            }
                        }

                        value = ((~Math.abs(value) + 1) + 255) % 255;

                    } else {
                        value = ((~value + 1) + 65535) % 65535;
                    }
                } else {

                    // Correct jump offsets for relative jumps
                    if (instr.mnemonic === 'jr') {
                        if (value > 0) {
                            value -= 2;
                        }
                    }

                }

                // Replace arg with resolved value
                instr.resolvedArg = value;

            }

        });
    },

    linkData: function() {
        var that = this;
        this.datas.forEach(function(data) {

            for(var i = 0, l = data.values.length; i < l; i++) {

                var value = data.values[i];

                // Resolve the correct value
                var resolved = that.compiler.resolve(
                    that,
                    value,
                    value.offset,
                    value.line,
                    value.col,
                    false
                );

                // DS can also store strings by splitting them
                if (data.isFixedSize) {

                    // Only strings can be contained in fixed sized sections
                    if (typeof resolved !== 'string') {
                        that.resolveError(
                            'Invalid value for fixed size storage area',
                            'Only strings can be embedded.',
                            data.line, data.col
                        );

                    } else if (resolved.length > data.size) {
                        that.resolveError(
                            'String length exceeds fixed storage area size',
                            'Length is ' + resolved.length + ' but must be 0-' + data.size,
                            data.line, data.col
                        );
                    }

                    // Pad strings with 0x00
                    value = new Array(data.size);
                    for(var e = 0; e < data.size; e++) {
                        if (e < resolved.length) {
                            value[e] = resolved.charCodeAt(e);

                        } else {
                            value[e] = 0;
                        }
                    }

                    data.resolvedValues = value;

                // Check bit width
                } else if (data.bits === 8 && (resolved < -127 || resolved > 255)) {
                    that.resolveError(
                        'Invalid value for byte data',
                        'Value is ' + value + ' but must be -128-255',
                        data.line, data.col
                    );

                } else if (data.bits === 16 && (resolved < -32767 || resolved > 65535)) {
                    that.resolveError(
                        'Invalid value for word data',
                        'Value is ' + value + ' but must be -32767-65535',
                        data.line, data.col
                    );

                // Convert signed values to twos complement
                } else if (resolved < 0) {
                    if (data.bits === 8) {
                        data.resolvedValues[i] = ((~resolved + 1) + 255) % 255;

                    } else {
                        data.resolvedValues[i] = ((~resolved + 1) + 65535) % 65535;
                    }

                } else {
                    data.resolvedValues[i] = resolved;
                }

            }

        });

    },


    // Getters ----------------------------------------------------------------
    getPath: function(line, col, nameOnly) {

        if (nameOnly) {
            return '[' + this.name + ']';

        } else {
            var offset = line !== undefined ? ' at line ' + line + ', col ' + col : '';
            if (this.parent) {
                return '[' + this.name + ']' + offset + ' (included from ' + this.parent.getPath(this.parentLine, this.parentCol) + ')';

            } else {
                return '[' + this.name + ']' + offset;
            }
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


    // Errors -----------------------------------------------------------------
    parseError: function(msg, expected, line, col) {

        var message = 'Unexpected ' + msg;
        message += ' at line ' + line + ', col ' + col;

        if (expected) {
            message += ', expected ' + expected + ' instead';
        }

        message += ':';

        var row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    resolveError: function(msg, reason, line, col) {

        var message = msg + '. ';
        message += reason;
        message += ':';

        var row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    defineError: function(name, line, col, existing) {

        var message = name + ', first declared in ';
        message += '[' + existing.file.name + '] at line ' + existing.line + ', col ' + existing.col;
        message += ':';

        var row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    sectionError: function(type, line, col) {

        var message = 'No SECTION directive encountered before ' + type + ', unable to resolve address:';

        var row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },


    // Logging ----------------------------------------------------------------
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


// Exports --------------------------------------------------------------------
module.exports = SourceFile;

