// Variable Definitions -------------------------------------------------------
// ----------------------------------------------------------------------------
function Variable(file, name, section, size, index) {

    this.file = file;
    this.name = name;
    this.offset = -1;
    this.section = section;
    this.size = size;
    this.index = index;
    this.references = 0;

    this.section.add(this);

}


// Methods --------------------------------------------------------------------
Variable.prototype = {

    toJSON: function() {
        return {
            type: 'Variable',
            name: this.name,
            offset: this.offset,
            size: this.size,
            references: this.references
        };
    }

};


// Exports --------------------------------------------------------------------
module.exports = Variable;

