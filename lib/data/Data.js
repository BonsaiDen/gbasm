// Data Storage ---------------------------------------------------------------
// ----------------------------------------------------------------------------
function Data(values, offset, section, isByte, size) {

    this.values = values;
    this.resolvedValues = [];
    this.offset = offset;
    this.section = section;
    this.bits = isByte ? 8 : 16;
    this.isFixedSize = size !== null;

    if (this.isFixedSize) {
        this.size = size;

    } else {
        this.size = values.length * (isByte ? 1 : 2);
    }

    this.section.add(this);

}


// Exports --------------------------------------------------------------------
module.exports = Data;

