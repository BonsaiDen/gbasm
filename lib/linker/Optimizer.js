// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Token = require('../parser/Lexer').Token;


// Assembly Instruction Optimizer ---------------------------------------------
// ----------------------------------------------------------------------------
function Optimizer(instr, next, unsafe) {

    var opCode = instr.raw[0];
    switch(opCode) {

        // ld a,[someLabel] -> ldh a,$XX
        case 0xFA:
            // Transform memory loads into high loads if argument is
            // in the range of 0xff00-0xffff
            if (instr.resolvedArg >= 0xff00 && instr.resolvedArg <= 0xffff) {

                instr.rewrite(
                    'ldh', 12, [0xF0],
                    new Token('NUMBER', instr.resolvedArg & 0xff, instr.index),
                    true
                );

                return 1;

            }
            break;

        // ld [someLabel],a -> ldh $XX,a
        case 0xEA:
            // Transform memory loads into high loads if argument is
            // in the range of 0xff00-0xffff
            if (instr.resolvedArg >= 0xff00 && instr.resolvedArg <= 0xffff) {

                instr.rewrite(
                    'ldh', 12, [0xE0],
                    new Token('NUMBER', instr.resolvedArg & 0xff, instr.index),
                    true
                );

                return 1;

            }
            break;

        // jp c,label  -> jr c,label
        // jp nc,label -> jr nc,label
        // jp z,label  -> jr z,label
        // jp nz,label -> jr nz,label
        // jp label    -> jr label
        case 0xDA:
        case 0xD2:
        case 0xCA:
        case 0xC2:
        case 0xC3:

            // Transform jp instructions into jrs if the target is in range
            // of one signed byte
            var offset = instr.resolvedArg - instr.offset;
            if (offset >= -127 && offset <= 128) {

                // Without flags
                if (opCode === 0xC3) {

                    // We need to check for padding here in case the JP is
                    // used in a jump table, otherwise we'll screw up the
                    // alignment causing all kinds of havoc

                    // Only replace if the next instruction is NOT a nop
                    if (unsafe && (!next || next.raw[0] !== 0x00)) {
                        instr.rewrite('jr', 12, [0x18], instr.arg, true, true);
                        return 1;
                    }

                // With flags
                } else {
                    instr.rewrite('jr', 12, [opCode - 0xA2], instr.arg, true, true);
                    return 1;
                }

            }
            break;

        // call LABEL
        // ret
        // ->
        // jp   LABEL
        case 0xCD:

            // Transform call instructions which are directly followed by a ret
            // into a simple jp
            if (next && next.raw[0] === 0xC9) {
                instr.rewrite('jp', 16, [0xC3], instr.arg);
                return 2;
            }
            break;

    }

    return 0;

}


// Exports --------------------------------------------------------------------
module.exports = Optimizer;

