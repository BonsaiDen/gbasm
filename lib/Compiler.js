// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var path = require('path'),
    SourceFile = require('./SourceFile');

require('colors');


// Assembly Code Compiler -----------------------------------------------------
// ----------------------------------------------------------------------------
function Compiler() {
    this.files = {};
    this.base = process.cwd();
}

Compiler.prototype = {

    compile: function(files) {

        var that = this;
        files.forEach(function(file) {
            that.include(null, path.join(that.base, file), 0);
        });

    },

    include: function(parent, file, offset) {

        var sourceFile = new SourceFile(this, parent, file, offset);
        this.files[file] = sourceFile;
        sourceFile.parse();
        return sourceFile;

    },

    error: function(file, message) {
        console.error(file.getPath().yellow + ' ' + message.red);
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

