// Label Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
function Label(file, name, section, parent, index) {

    this.file = file;
    this.name = name;
    this.offset = -1;
    this.label = null;
    this.section = section;
    this.parent = parent;
    this.children = [];
    this.isLocal = !!parent;
    this.index = index;
    this.references = 0;

    if (this.parent) {
        this.parent.children.push(this);
    }

    this.section.add(this);

}


// Methods --------------------------------------------------------------------
Label.prototype = {

    toJSON() {
        return {
            type: 'Label',
            name: this.name,
            offset: this.offset,
            isLocal: this.isLocal,
            references: this.references
        };
    }

};


// Exports --------------------------------------------------------------------
module.exports = Label;

