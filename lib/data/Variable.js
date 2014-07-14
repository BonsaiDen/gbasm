// Variable Definitions -------------------------------------------------------
// ----------------------------------------------------------------------------
function Variable(file, name, offset, section, size, line, col) {

    this.file = file;
    this.name = name;
    this.offset = offset;
    this.section = section;
    this.size = size;
    this.line = line;
    this.col = col;

    this.section.add(this);

}


// Variable Methods -----------------------------------------------------------
Variable.prototype = {

    toString: function() {
        return '[Variable "' + this.name + '" @ ' + this.offset.toString(16) + ']';
    }

};


// Exports --------------------------------------------------------------------
module.exports = Variable;

