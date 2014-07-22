// DataBlocks -----------------------------------------------------------------
// ----------------------------------------------------------------------------
function DataBlock(values, section, isByte, size, index) {

    this.values = values;
    this.resolvedValues = [];
    this.offset = -1;
    this.section = section;
    this.bits = isByte ? 8 : 16;
    this.isFixedSize = size !== null;
    this.index = index;

    if (this.isFixedSize) {
        this.size = size;

    } else {
        this.size = values.length * (isByte ? 1 : 2);
    }

    this.section.add(this);

}


// Exports --------------------------------------------------------------------
module.exports = DataBlock;

