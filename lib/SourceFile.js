// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path'),
    Parser = require('./parser/Parser');


// Assembly Source File Abstraction -------------------------------------------
// ----------------------------------------------------------------------------
function SourceFile(compiler, file, offset) {

    this.compiler = compiler;
    this.name = path.basename(file);
    this.path = file;

    // Data
    this.source = fs.readFileSync(this.path).toString();
    this.size = 0;
    this.offset = offset;

    // Code
    this.instructions = [];
    this.labels = [];
    this.includes = [];
    this.variabels = [];
    this.constants = [];

}

SourceFile.prototype = {

    parse: function() {

        var start = Date.now();

        this.parser = new Parser(this);
        this.log('Tokenized in %sms', Date.now() - start);

        this.parser.parse();
        this.log('Parsed in %sms', Date.now() - start);

        console.log(this.instructions);

    },

    log: function() {

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

    parseError: function(msg, expected, line, col) {

        var message = 'Unexpected ' + msg;
        message += ' at line ' + line + ', col ' + col;

        if (expected) {
            message += ', expected ' + expected + ' instead';
        }

        message += ':';

        var row = this.source.split(/[\n\r]/)[line - 1],
            pointer = new Array(col + 1).join(' ') + '^';

        console.log(message + '\n\n    ' + row + '\n    ' + pointer);

        throw new TypeError(message);

    }

};


// Exports --------------------------------------------------------------------
module.exports = SourceFile;

