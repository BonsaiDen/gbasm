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
    DataBlock = require('./data/DataBlock'),
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

    try {
        this.source = fs.readFileSync(this.path).toString();

    } catch(err) {
        this.fileError(err, 'include source file', this.path, line, col);
    }

    this.currentSection = section;

    // Code
    this.instructions = [];
    this.relativeJumpTargets = [];
    this.includes = [];
    this.sections = [];
    this.labels = [];
    this.variables = [];
    this.constants = [];
    this.binaryIncludes = [];
    this.dataBlocks = [];
    this.unresolvedSizes = [];

}

SourceFile.prototype = {

    // API --------------------------------------------------------------------
    parse: function() {
        this.parser = new Parser(this);
        this.parser.parse();
    },

    address: function() {

        var that = this;
        if (this.unresolvedSizes.length) {

            // Resolve any outstanding sizes for data and variables
            this.unresolvedSizes.forEach(function(entry) {
                entry.size = that.compiler.resolve(
                    that,
                    entry.size,
                    entry.offset,
                    entry.line,
                    entry.col,
                    false
                );
            });

            this.unresolvedSizes.length = 0;

        }

        // Now recalculate the offsets of all entries with all sections
        this.sections.forEach(function(section) {
            section.calculateOffsets();
        });

        // For relative jumps, we check if the target is a OFFSET and switch
        // it with the actual instruction it points to.
        // This is required to preserve relative jump target through code
        // optimization were instructions and thus their size and address might
        // be altered.
        if (this.relativeJumpTargets.length) {

            this.relativeJumpTargets.forEach(function(instr) {

                var target = that.findInstructionByOffset(instr.offset, instr.arg.value);
                if (!target) {
                    that.resolveError('Invalid jump offset',
                        'Must point at the start of a instruction',
                        instr.line, instr.col
                    );

                } else {
                    instr.arg = target;
                }

            });

            this.relativeJumpTargets.length = 0;

        }

    },

    link: function(initial) {
        this.linkInstructions();
        this.linkData();
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

        this.dataBlocks.forEach(function(data) {

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

        this.binaryIncludes.forEach(function(binary) {

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

    resolveSectionBySignature: function(signature) {

        for(var i = 0, l = this.sections.length; i < l; i++) {
            if (this.sections[i].signature === signature) {
                return this.sections[i];
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

    addSection: function(name, segment, bank, offset) {

        var signature = Section.Signature(segment.value, bank, offset),
            matchingSection = this.compiler.resolveSectionBySignature(signature);

        if (matchingSection) {

            // If both sections have no target offset we can safely concatenate
            // their entries
            if (offset === null) {
                return matchingSection; // Alias

            // Otherwise we'll run into problems
            } else {
                throw new TypeError('Overlapping sections defined');
            }

        } else {
            this.currentSection = new Section(this, name, segment.value, bank, offset, segment.line, segment.col);
            this.sections.push(this.currentSection);
        }

    },

    addBinaryInclude: function(src, line, col) {
        this.binaryIncludes.push(new Binary(this, src.value, this.currentSection, line, col));
    },

    addDataBlock: function(values, isByte, size, line, col) {

        this.checkForSection('data', line, col);

        var data = new DataBlock(values, this.currentSection, isByte, size);
        this.dataBlocks.push(data);

        if (typeof data.size === 'object') {
            this.unresolvedSizes.push(data);
        }

    },

    addInstruction: function(mnemonic, cycles, code, arg, isByte, isSigned, isBit, line, col) {

        this.checkForSection('instruction', line, col);

        var instr = new Instruction(
            mnemonic, this.currentSection,
            cycles, code, arg, isByte, isSigned, isBit,
            line, col
        );

        this.instructions.push(instr);

        if (instr.mnemonic === 'jr' && instr.arg.type === 'OFFSET') {
            this.relativeJumpTargets.push(instr);
        }

    },

    addVariable: function(name, size, line, col) {

        this.checkForSection('variable', line, col, true);

        var variable = new Variable(this, name, this.currentSection, size, line, col);
        this.variables.push(variable);

        if (typeof variable.size === 'object') {
            this.unresolvedSizes.push(variable);
        }

    },

    addLabel: function(name, parent, line, col) {

        this.checkForSection('label', line, col);

        // Check for duplicate global lables
        if (!parent) {
            this.checkForDefinition('global label', name, line, col);

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

    addConstant: function(name, value, isString, line, col) {
        this.checkForDefinition('constant', name, line, col);
        this.constants.push(new Constant(this, name, value, isString, line, col));
    },


    // Checks -----------------------------------------------------------------
    checkForDefinition: function(entryType, name, line, col) {

        var existing = this.compiler.resolveName(name);
        if (existing) {
            this.defineError(
                'Redefinition of ' + entryType + ' "' + name + '"',
                line, col, existing
            );
        }

    },

    checkForSection: function(entryType, line, col) {
        if (!this.currentSection) {
            this.sectionMissingError(entryType, line, col);
        }
    },



    // Internal Linking Code --------------------------------------------------
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
        this.dataBlocks.forEach(function(data) {

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

    getMinimumRomSize: function() {

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

        var message = 'Unexpected ' + msg,
            row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        message += ' at line ' + line + ', col ' + col;

        if (expected) {
            message += ', expected ' + expected + ' instead';
        }

        message += ':';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    resolveError: function(msg, reason, line, col) {

        var message = msg + '. ' + reason + ':',
            row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    defineError: function(name, line, col, existing) {

        var message = name + ', first declared in ',
            row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        message += '[' + existing.file.name + '] at line ' + existing.line + ', col ' + existing.col;
        message += ':';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    sectionMissingError: function(type, line, col) {

        var message = 'No SECTION directive encountered before ' + type + ', unable to resolve address:',
            row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        this.error(line, col, message + '\n\n    ' + row + '\n    ' + pointer);

    },

    fileError: function(err, msg, filePath, col, line) {

        var message = 'Unable to ' + msg + ' "' + filePath + '"',
            row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col).join(' ') + '^';

        message += ', at line ' + line + ', col ' + col + '. ';
        message += 'File was not found:';

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

