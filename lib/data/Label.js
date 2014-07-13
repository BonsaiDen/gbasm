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


// Exports --------------------------------------------------------------------
module.exports = Label;

