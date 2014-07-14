// Label Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
function Label(file, name, offset, section, parent, line, col) {

    this.file = file;
    this.name = name;
    this.offset = offset;
    this.section = section;
    this.parent = parent;
    this.children = [];
    this.isLocal = !!parent;
    this.line = line;
    this.col = col;

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

