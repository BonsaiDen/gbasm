// DataBlocks -----------------------------------------------------------------
// ----------------------------------------------------------------------------
function DataBlock(values, section, isByte, size) {

    this.values = values;
    this.resolvedValues = [];
    this.offset = -1;
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
module.exports = DataBlock;

