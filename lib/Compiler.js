// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var path = require('path'),
    SourceFile = require('./SourceFile');


// Assembly Code Compiler -----------------------------------------------------
// ----------------------------------------------------------------------------
function Compiler() {
    this.files = {};
}

Compiler.prototype = {

    compile: function(files) {

        var that = this;
        files.forEach(function(file) {
            that.include(null, path.join(process.cwd(), file), 0);
        });

    },

    include: function(parent, path, offset) {

        // TODO error in case of double included file
        // TODO detect circular includes

        if (parent) {
            path = path.join(path.dirname(parent), path);
        }

        var file = new SourceFile(this, path, offset);
        this.files[path] = file;

        file.parse();

    },

    log: function() {

    },

    error: function() {
        process.exit(1);
    }

};


// Exports --------------------------------------------------------------------
module.exports = Compiler;

