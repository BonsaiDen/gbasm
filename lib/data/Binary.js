// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    path = require('path');


// Binary Includes ------------------------------------------------------------
// ----------------------------------------------------------------------------
function Binary(file, src, section, line, col) {

    this.file = file;

    if (src.substring(0, 1) === '/') {
        this.src = path.join(this.file.compiler.base, src.substring(1));

    } else {
        this.src = path.join(path.dirname(this.file.path), src);
    }

    this.section = section;
    this.offset = -1;

    try {
        this.size = fs.lstatSync(this.src).size;

    } catch(err) {
        this.file.fileError(err, 'include binary data', this.src, line, col);
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

