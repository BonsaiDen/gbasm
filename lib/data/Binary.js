// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path');


// Binary Includes ------------------------------------------------------------
// ----------------------------------------------------------------------------
function Binary(file, src, offset, section) {

    this.file = file;
    this.src = path.join(path.dirname(this.file.path), src);
    this.section = section;
    this.offset = offset;

    try {
        this.size = fs.lstatSync(this.src).size;

    } catch(e) {
        // TODO compiler error
        throw new TypeError('File not found');
    }

    this.section.add(this);

}


Binary.prototype = {

    getBuffer: function() {
        return fs.readFileSync(this.src);
    }

};


// Exports --------------------------------------------------------------------
module.exports = Binary;

