// Variable Definitions -------------------------------------------------------
// ----------------------------------------------------------------------------
function Variable(file, name, section, size, index) {

    this.file = file;
    this.name = name;
    this.offset = -1;
    this.section = section;
    this.size = size;
    this.index = index;

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

