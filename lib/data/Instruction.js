// CPU Instructions -----------------------------------------------------------
// ----------------------------------------------------------------------------
function Instruction(mnemonic, section, cycles, code, arg, isByte, isSigned, isBit, index) {

    this.mnemonic = mnemonic;
    this.section = section;
    this.offset = -1;
    this.size = code.length + (arg ? (isByte ? 1 : 2) : 0);
    this.cycles = cycles;

    this.raw = code;
    this.arg = arg;
    this.resolvedArg = null;

    this.bits = isByte ? 8 : 16;
    this.isSigned = !!isSigned;
    this.isBit = !!isBit;
    this.index = index;

    this.section.add(this);

}


// Methods --------------------------------------------------------------------
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

    },

    toJSON: function() {
        return {
            type: 'Instruction',
            mnemonic: this.mnemonic,
            offset: this.offset,
            size: this.size,
            cycles: this.cycles,
            arg: this.resolvedArg
        };
    }

};


// Exports --------------------------------------------------------------------
module.exports = Instruction;

