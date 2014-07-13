// Compile Time Constants -----------------------------------------------------
// ----------------------------------------------------------------------------
function Constant(file, name, value, isString, line, col) {

    this.file = file;
    this.name = name;
    this.value = value;
    this.isString = isString;
    this.line = line;
    this.col = col;

}


// Exports --------------------------------------------------------------------
module.exports = Constant;

