// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path'),
    Parser = require('./parser/Parser');


// Assembly Source File Abstraction -------------------------------------------
// ----------------------------------------------------------------------------
function SourceFile(compiler, parent, file, offset) {

    this.compiler = compiler;
    this.name = file.substring(compiler.base.length + 1);
    this.parent = parent;
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
        var includedFile = this.compiler.include(this, file, this.offset);
        this.includes.push(includedFile);
        this.offset += includedFile.size;

    },

    instruction: function(mnemonic, cycles, code, arg, isByte, isSigned) {

        var instr = new Instruction(
            mnemonic, this.offset, cycles,
            code, arg, isByte, isSigned
        );

        this.instructions.push(instr);
        this.offset += instr.size;
        this.size += instr.size;

    },

    section: function(name, segment, offset) {
        this.sections.push(new Section(name, segment, offset));
        this.offset = offset;
    },

    variable: function(name, size) {
        this.variables.push(new Variable(name, this.offset, size));
        this.offset += size;
    },

    label: function(name, parent) {
        var label = new Label(name, this.offset, parent);
        this.labels.push(label);
        return label;
    },

    constant: function(name, value, isString) {
        this.constants.push(new Constant(name, value, isString));
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
    getPath: function() {

        if (this.parent) {
            return this.parent.getPath() + ' > [' + this.name + ']';

        } else {
            return '[' + this.name + ']';
        }

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
            pointer = new Array(col + 1).join(' ') + '^';

        this.error(message + '\n\n    ' + row + '\n    ' + pointer);

    },

    error: function(message) {
        this.compiler.error(this, message);
    },

    warning: function(message) {
        this.compiler.warning(this, message);
    },

    log: function(message) {
        this.compiler.log(this, message);
    }

};


// Classes --------------------------------------------------------------------
function Instruction(mnemonic, offset, cycles, code, arg, isByte, isSigned) {
    this.mnemonic = mnemonic;
    this.offset = offset;
    this.size = code.length + (arg ? (isByte ? 1 : 2) : 0);
    this.cycles = cycles;
    this.raw = code;
    this.arg = arg;
    this.bytes = isByte ? 8 : 16;
    this.isSigned = !!isSigned;
}

function Section(name, segment, offset) {
    this.name = name;
    this.segment = segment;
    this.offset = offset;
}

function Variable(name, offset, size) {
    this.name = name;
    this.offset = offset;
    this.size = size;
}

function Label(name, offset, parent) {
    this.name = name;
    this.offset = offset;
    this.parent = parent;
    this.isLocal = !!parent;
}

function Constant(name, value, isString) {
    this.name = name;
    this.value = value;
    this.isString = isString;
}

function Data(values, offset, isByte) {
    this.values = values;
    this.offset = offset;
    this.size = values.length * (isByte ? 1 : 2);
    this.bytes = isByte ? 8 : 16;
}


// Exports --------------------------------------------------------------------
module.exports = SourceFile;

