// Assembly Instruction Optimizer ---------------------------------------------
// ----------------------------------------------------------------------------
function Optimizer(instr) {

    var opCode = instr.raw[0];
    switch(opCode) {

        // ld a,[someLabel] -> ldh a,$XX
        case 0xFA:
            // Transform memory loads into high loads if argument is
            // in the range of 0xff00-0xffff
            if (instr.argResolved >= 0xff00 && instr.argResolved <= 0xffff) {
                instr.raw = [];
                console.log(instr.arg & 0x00ff);
                console.log('Found instr');
                //instr.rewrite('ldh', 12, [0xF0], new Token('NUMBER', instr.argResolved & 0xff), true);
            }
            break;

        // Extended instructions
        case 0xCB:
            break;
    }

}


// Exports --------------------------------------------------------------------
module.exports = Optimizer;

