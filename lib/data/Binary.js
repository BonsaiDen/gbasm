// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path');


// Binary Includes ------------------------------------------------------------
// ----------------------------------------------------------------------------
function Binary(file, src, section, line, col) {

    this.file = file;
    this.src = path.join(path.dirname(this.file.path), src);
    this.section = section;
    this.offset = -1;

    try {
        this.size = fs.lstatSync(this.src).size;

    } catch(err) {
        this.file.fileError(err, 'include binary data', line, col);
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

