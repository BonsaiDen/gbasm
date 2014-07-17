// Label Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
function Label(file, name, section, parent, index) {

    this.file = file;
    this.name = name;
    this.offset = -1;
    this.section = section;
    this.parent = parent;
    this.children = [];
    this.isLocal = !!parent;
    this.index = index;

    if (this.parent) {
        this.parent.children.push(this);
    }

    this.section.add(this);

}


// Label Methods --------------------------------------------------------------
Label.prototype = {

    toString: function() {
        return '[Label "' + this.name + '" @ ' + this.offset.toString(16) + ']';
    }

};


// Exports --------------------------------------------------------------------
module.exports = Label;

