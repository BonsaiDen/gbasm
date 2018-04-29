// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
const fs = require('fs'),
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
    this.parent = parent;
    this.parentIndex = index;
    this.path = file;
    this.name = file instanceof Buffer ? 'memory' : file.substring(compiler.base.length + 1);
    this.buffer = file instanceof Buffer ? file : fs.readFileSync(this.path);

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
    this.names = {};

}

SourceFile.prototype = {

    parse(debug) {
        this.parser = new Parser(this, new Lexer(this), debug);
        this.parser.parse();
    },

    include(file, index) {

        // Relative includes
        if (file.substring(0, 1) === '/') {
            file = path.join(this.compiler.base, file.substring(1));

        } else {
            file = path.join(path.dirname(this.path), file);
        }

        // Check for circular includes
        let p = this;
        while(p) {
            if (p.path === file) {
                Errors.ParseError(this, `circular inclusion of "${  this.name  }"`, null, index);
            }
            p = p.parent;
        }

        // Parse the file
        try {
            const includedFile = this.compiler.includeFile(this, file, this.currentSection, index);
            this.currentSection = includedFile.currentSection;

        } catch(err) {
            if (err instanceof TypeError) {
                throw err;

            } else {
                Errors.IncludeError(this, err, 'include source file', this.path, index);
            }
        }

    },

    symbols() {

        const symbols = [];
        symbols.push.apply(symbols, this.variables.map((v) => {
            return v;
        }));

        symbols.push.apply(symbols, this.labels.map((l) => {
            return l;
        }));

        return symbols;

    },


    // Entries ----------------------------------------------------------------
    addSection(name, segment, bank, offset) {
        this.currentSection = new Section(this, name, segment.value, bank, offset, segment.index);
        this.sections.push(this.currentSection);
    },

    addBinaryInclude(src, index) {
        this.binaryIncludes.push(new Binary(this, src.value, this.currentSection, index));
    },

    addDataBlock(values, isByte, size, index) {

        this.checkForSection('Data', index);

        const data = new DataBlock(values, this.currentSection, isByte, size, index);
        this.dataBlocks.push(data);

        if (typeof data.size === 'object') {
            this.unresolvedSizes.push(data);
        }

    },

    addInstruction(mnemonic, cycles, code, arg, isByte, isSigned, isBit, index) {

        this.checkForSection('Instruction', index);

        const instr = new Instruction(
            mnemonic, this.currentSection,
            cycles, code, arg, isByte, isSigned, isBit,
            index
        );

        this.instructions.push(instr);

        if (instr.mnemonic === 'jr' && instr.arg.type === 'OFFSET') {
            this.relativeJumpTargets.push(instr);
        }

    },

    addVariable(name, size, index) {

        this.checkForSection('Variable', index, true);
        this.checkForDefinition('variable', name, index);

        const variable = new Variable(this, name, this.currentSection, size, index);
        this.names[name] = variable;
        this.variables.push(variable);

        if (typeof variable.size === 'object') {
            this.unresolvedSizes.push(variable);
        }

    },

    addLabel(name, parent, index) {

        this.checkForSection('Label', index);

        // Check for duplicate global lables
        if (!parent) {
            this.checkForDefinition('global label', name, index);

        // Check for duplicate local labels
        } else if (parent) {

            for(let i = 0, l = parent.children.length; i < l; i++) {
                if (parent.children[i].name === name) {
                    Errors.DeclarationError(
                        this,
                        `Local label "${  name  }"`,
                        index, parent.children[i]
                    );
                }
            }

        }

        const label = new Label(this, name, this.currentSection, parent, index);
        this.names[name] = label;
        this.labels.push(label);

        return label; // return label for parent label assignments in Parser

    },

    addConstant(name, value, index) {
        this.checkForDefinition('constant', name, index);
        this.names[name] = new Constant(this, name, value, index);
    },

    addMacro(name, args, tokens, index) {
        this.checkForDefinition('macro', name, index);
        this.names[name] = new Macro(this, name, args, tokens, index);
    },

    addMacroCall(expression, index) {

        if (!this.currentSection) {
            Errors.MacroError(this, 'Macro call must be made within a section', index);
        }

        this.currentSection.add(expression.value);

    },


    // Entry Validation -------------------------------------------------------
    checkForDefinition(entryType, name, index) {

        if (BuiltinMacro.isDefined(name)) {
            Errors.DeclarationError(this, `shadows built-in macro ${  name}`, index);

        } else {

            const existing = Linker.resolveName(name, this);
            if (existing && !existing.parent) {
                Errors.DeclarationError(
                    this,
                    `${entryType  } "${  name  }"`,
                    index, existing
                );
            }

        }

    },

    checkForSection(entryType, index) {
        if (!this.currentSection) {
            Errors.AddressError(this, `${entryType  } was not declared within any section`, index);
        }
    },


    // Getters ----------------------------------------------------------------
    getPath(index, nameOnly) {

        const i = this.getLineInfo(index),
            offset = index !== undefined ? ` (line ${  i.line + 1  }, col ${  i.col  })` : '';

        if (this.parent && !nameOnly) {
            return `[${  this.name  }]${  offset  }\n    included from ${  this.parent.getPath(this.parentIndex, true)  }`;

        }
        return `[${  this.name  }]${  offset}`;


    },

    getLineInfo(index) {

        let line = 0,
            col = 0,
            i = 0;

        while(i < index) {

            const ch = this.buffer[i++];
            if (ch === 10 || ch === 13) {
                line++;
                col = 0;

            } else {
                col++;
            }

        }

        return {
            line,
            col
        };

    },

    getLineSource(index) {
        const i = this.getLineInfo(index);
        return {
            line: i.line,
            col: i.col,
            source: `${new Array(61).join('-').grey
            }\n\n    ${
                this.buffer.toString().split(/[\n\r]/)[i.line].white
            }\n    ${
                new Array(i.col).join(' ')  }${'^---'.red}`
        };
    },


    // Logging ----------------------------------------------------------------
    error(error) {
        this.compiler.error(this, error);
    },

    warning(index, message) {
        this.compiler.warning(this, index, message);
    },

    log(message) {
        this.compiler.log(this, message);
    }

};


// Exports --------------------------------------------------------------------
module.exports = SourceFile;

