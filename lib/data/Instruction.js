// CPU Instructions -----------------------------------------------------------
// ----------------------------------------------------------------------------
function Instruction(mnemonic, offset, section, cycles, code, arg, isByte, isSigned, isBit, line, col) {

    this.mnemonic = mnemonic;
    this.section = section;
    this.offset = offset;
    this.size = code.length + (arg ? (isByte ? 1 : 2) : 0);
    this.cycles = cycles;

    this.raw = code;
    this.arg = arg;
    this.resolvedArg = null;

    this.bits = isByte ? 8 : 16;
    this.isSigned = !!isSigned;
    this.isBit = !!isBit;
    this.line = line;
    this.col = col;

    this.section.add(this);

}

Instruction.prototype = {

    rewrite: function(mnemonic, cycles, code, arg, isByte, isSigned, isBit) {

        this.mnemonic = mnemonic;
        this.size = code.length + (arg ? (isByte ? 1 : 2) : 0);
        this.cycles = cycles;
        this.raw = code;
        this.arg = arg;
        this.resolvedArg = null;
        this.bits = isByte ? 8 : 16;
        this.isSigned = !!isSigned;
        this.isBit = !!isBit;

    }

};


// Exports --------------------------------------------------------------------
module.exports = Instruction;

