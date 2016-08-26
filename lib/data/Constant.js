// Compile Time Constants -----------------------------------------------------
// ----------------------------------------------------------------------------
function Constant(file, name, value, index) {
    this.file = file;
    this.name = name;
    this.value = value;
    this.index = index;
    this.references = 0;
}


// Exports --------------------------------------------------------------------
module.exports = Constant;

