// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var path = require('path'),
    SourceFile = require('./SourceFile');

require('colors');


// Assembly Code Compiler -----------------------------------------------------
// ----------------------------------------------------------------------------
function Compiler() {
    this.files = [];
    this.base = process.cwd();
}

Compiler.prototype = {

    compile: function(files) {
        var that = this;
        files.forEach(function(file) {
            that.include(null, path.join(that.base, file), 0);
        });
    },

    link: function() {
        this.files.forEach(function(file) {
            file.link();
        });
    },

    include: function(parent, file, offset) {
        var sourceFile = new SourceFile(this, parent, file, offset);
        this.files.push(sourceFile);
        sourceFile.parse();
        return sourceFile;
    },

    resolve: function(value) {
        switch(value.type) {
            case 'NUMBER':
                // TODO check size of number
                return value.value;

            // TODO for expressions resolve the sub parts and then build and
            // run the expression
            default:
                //console.log(value);
                break;
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

    // TODO return the actual object so we can get the line / col
    hasName: function(name) {
        return this.files.some(function(file) {
            return file.hasName(name);
        });
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

