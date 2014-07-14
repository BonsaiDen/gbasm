// Variable Definitions -------------------------------------------------------
// ----------------------------------------------------------------------------
function Variable(file, name, section, size, line, col) {

    this.file = file;
    this.name = name;
    this.offset = -1;
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

