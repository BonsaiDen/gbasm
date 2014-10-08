// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path'),
    Parser = require('./parser/Parser'),
    Lexer = require('./parser/Lexer'),

    // Linking
    BuiltinMacro = require('./linker/Macro'),
    Linker = require('./linker/Linker'),

    // Entries
    Section = require('./data/Section'),
    Label = require('./data/Label'),
    Constant = require('./data/Constant'),
    Variable = require('./data/Variable'),
    DataBlock = require('./data/DataBlock'),
    Binary = require('./data/Binary'),
    Instruction = require('./data/Instruction'),
    Macro = require('./data/Macro'),

    // Errors
    Errors = require('./Errors');


// Assembly Source File Abstraction -------------------------------------------
// ----------------------------------------------------------------------------
function SourceFile(compiler, parent, file, section, index) {

    this.compiler = compiler;
    this.name = file.substring(compiler.base.length + 1);
    this.parent = parent;
    this.parentIndex = index;
    this.path = file;
    this.buffer = fs.readFileSync(this.path);

    // Code
    this.currentSection = section;
    this.instructions = [];
    this.relativeJumpTargets = [];
    this.sections = [];
    this.labels = [];
    this.variables = [];
    this.binaryIncludes = [];
    this.dataBlocks = [];
    this.unresolvedSizes = [];
    this.names = new Object();

}

SourceFile.prototype = {

    parse: function() {
        this.parser = new Parser(this, new Lexer(this));
        this.parser.parse();
    },

    include: function(file, index) {

        // Relative includes
        if (file.substring(0, 1) === '/') {
            file = path.join(this.compiler.base, file.substring(1));

        } else {
            file = path.join(path.dirname(this.path), file);
        }

        // Check for circular includes
        var p = this;
        while(p) {
            if (p.path === file) {
                new Errors.ParseError(this, 'circular inclusion of "' + this.name + '"', null, index);
            }
            p = p.parent;
        }

        // Parse the file
        try {
            var includedFile = this.compiler.includeFile(this, file, this.currentSection, index);
            this.currentSection = includedFile.currentSection;

        } catch(err) {
            if (err instanceof TypeError) {
                throw err;

            } else {
                new Errors.IncludeError(this, err, 'include source file', this.path, index);
            }
        }

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


    // Entries ----------------------------------------------------------------
    addSection: function(name, segment, bank, offset) {
        this.currentSection = new Section(this, name, segment.value, bank, offset, segment.index);
        this.sections.push(this.currentSection);
    },

    addBinaryInclude: function(src, index) {
        this.binaryIncludes.push(new Binary(this, src.value, this.currentSection, index));
    },

    addDataBlock: function(values, isByte, size, index) {

        this.checkForSection('Data', index);

        var data = new DataBlock(values, this.currentSection, isByte, size, index);
        this.dataBlocks.push(data);

        if (typeof data.size === 'object') {
            this.unresolvedSizes.push(data);
        }

    },

    addInstruction: function(mnemonic, cycles, code, arg, isByte, isSigned, isBit, index) {

        this.checkForSection('Instruction', index);

        var instr = new Instruction(
            mnemonic, this.currentSection,
            cycles, code, arg, isByte, isSigned, isBit,
            index
        );

        this.instructions.push(instr);

        if (instr.mnemonic === 'jr' && instr.arg.type === 'OFFSET') {
            this.relativeJumpTargets.push(instr);
        }

    },

    addVariable: function(name, size, index) {

        this.checkForSection('Variable', index, true);
        this.checkForDefinition('variable', name, index);

        var variable = new Variable(this, name, this.currentSection, size, index);
        this.names[name] = variable;
        this.variables.push(variable);

        if (typeof variable.size === 'object') {
            this.unresolvedSizes.push(variable);
        }

    },

    addLabel: function(name, parent, index) {

        this.checkForSection('Label', index);

        // Check for duplicate global lables
        if (!parent) {
            this.checkForDefinition('global label', name, index);

        // Check for duplicate local labels
        } else if (parent) {

            for(var i = 0, l = parent.children.length; i < l; i++) {
                if (parent.children[i].name === name) {
                    new Errors.DeclarationError(
                        this,
                        'Local label "' + name + '"',
                        index, parent.children[i]
                    );
                }
            }

        }

        var label = new Label(this, name, this.currentSection, parent, index);
        this.names[name] = label;
        this.labels.push(label);

        return label; // return label for parent label assignments in Parser

    },

    addConstant: function(name, value, index) {
        this.checkForDefinition('constant', name, index);
        this.names[name] = new Constant(this, name, value, index);
    },

    addMacro: function(name, args, tokens, index) {
        this.checkForDefinition('macro', name, index);
        this.names[name] = new Macro(this, name, args, tokens, index);
    },

    addMacroCall: function(expression, index) {
        this.checkForSection('MacroCall', index, true);
        this.currentSection.add(expression.value);
    },


    // Entry Validation -------------------------------------------------------
    checkForDefinition: function(entryType, name, index) {

        if (BuiltinMacro.isDefined(name)) {
            new Errors.DeclarationError(this, 'shadows built-in macro ' + name, index);

        } else {

            var existing = Linker.resolveName(name, this);
            if (existing && !existing.parent) {
                new Errors.DeclarationError(
                    this,
                    entryType + ' "' + name + '"',
                    index, existing
                );
            }

        }

    },

    checkForSection: function(entryType, index) {
        if (!this.currentSection) {
            new Errors.AddressError(this, entryType + ' was not declared within any section', index);
        }
    },


    // Getters ----------------------------------------------------------------
    getPath: function(index, nameOnly) {

        var i = this.getLineInfo(index),
            offset = index !== undefined ? ' (line ' + (i.line + 1) + ', col ' + i.col + ')' : '';

        if (this.parent && !nameOnly) {
            return '[' + this.name + ']' + offset + '\n    included from ' + this.parent.getPath(this.parentIndex, true) + '';

        } else {
            return '[' + this.name + ']' + offset;
        }

    },

    getLineInfo: function(index) {

        var line = 0,
            col = 0,
            i = 0;

        while(i < index) {

            var ch = this.buffer[i++];
            if (ch === 10 || ch === 13) {
                line++;
                col = 0;

            } else {
                col++;
            }

        }

        return {
            line: line,
            col: col
        };

    },

    getLineSource: function(index) {
        var i = this.getLineInfo(index);
        return {
            line: i.line,
            col: i.col,
            source: new Array(61).join('-').grey
                    + '\n\n    '
                    + this.buffer.toString().split(/[\n\r]/)[i.line].white
                    + '\n    '
                    + new Array(i.col).join(' ') + '^---'.red
        };
    },


    // Logging ----------------------------------------------------------------
    error: function(error) {
        this.compiler.error(this, error);
    },

    warning: function(index, message) {
        this.compiler.warning(this, index, message);
    },

    log: function(message) {
        this.compiler.log(this, message);
    }

};


// Exports --------------------------------------------------------------------
module.exports = SourceFile;

