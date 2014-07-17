// Compile Time Constants -----------------------------------------------------
// ----------------------------------------------------------------------------
function Constant(file, name, value, isString, index) {
    this.file = file;
    this.name = name;
    this.value = value;
    this.isString = isString;
    this.index = index;
}


// Exports --------------------------------------------------------------------
module.exports = Constant;

