// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
const Token = require('../parser/Lexer').Token;


// Assembly Instruction Optimizer ---------------------------------------------
// ----------------------------------------------------------------------------
function Optimizer(instr, unsafe, next, nextTwo) {

    const opCode = instr.raw[0];
    switch(opCode) {

        // ld a,0 -> xor a
        //
        // -> save 1 byte and 3 T-states
        case 0x3E:
            if (instr.resolvedArg === 0x00) {
                instr.rewrite('xor', 4, [0x07 + 0xA8]);
                return 1;
            }
            break;

        // cp 0 -> or a
        //
        // save 1 byte and 3 T-states
        case 0xFE:
            if (instr.resolvedArg === 0x00) {
                instr.rewrite('or', 4, [0x07 + 0xB0]);
                return 1;
            }
            break;

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
            const offset = instr.resolvedArg - instr.offset;
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
        //
        // save 1 byte and 17 T-states
        case 0xCD:

            // Transform call instructions which are directly followed by a ret
            // into a simple jp
            if (next && next.raw[0] === 0xC9 && next.label === null) {
                instr.rewrite('jp', 16, [0xC3], instr.arg);
                return 2;
            }
            break;

        // ld b,$XX
        // ld c,$XX
        // ->
        // ld bc,$XXXX
        //
        // -> save 1 byte and 4 T-states
        case 0x06:
            if (next && next.raw[0] === 0x0E && next.label === null) {
                instr.rewrite(
                    'ld', 12, [0x01],
                    new Token(
                        'NUMBER',
                        (instr.resolvedArg << 8) | next.resolvedArg,
                        instr.index
                    )
                );
                return 2;
            }
            break;

        // ld d,$XX
        // ld e,$XX
        // ->
        // ld de,$XXXX
        //
        // -> save 1 byte and 4 T-states
        case 0x16:
            if (next && next.raw[0] === 0x1E && next.label === null) {
                instr.rewrite(
                    'ld', 12, [0x11],
                    new Token(
                        'NUMBER',
                        (instr.resolvedArg << 8) | next.resolvedArg,
                        instr.index
                    )
                );
                return 2;
            }
            break;

        // ld h,$XX
        // ld l,$XX
        // ->
        // ld hl,$XXXX
        //
        // -> save 1 byte and 4 T-states
        case 0x26:
            if (next && next.raw[0] === 0x2E && next.label === null) {
                instr.rewrite(
                    'ld', 12, [0x21],
                    new Token(
                        'NUMBER',
                        (instr.resolvedArg << 8) | next.resolvedArg,
                        instr.index
                    )
                );
                return 2;
            }
            break;

        // srl a
        // srl a
        // srl a
        // ->
        // rrca
        // rrca
        // rrca
        // and %00011111
        //
        // save 1 byte and 5 T-states
        case 0xCB:
            if (next && nextTwo && instr.raw[1] === 0x38 + 0x07)  {
                if (next.raw[0] === 0xCB &&
                    next.raw[1] === 0x38 + 0x07 &&
                    next.label === null &&
                    nextTwo.raw[0] === 0xCB &&
                    nextTwo.raw[1] === 0x38 + 0x07 &&
                    nextTwo.label === null) {

                    instr.rewrite(
                        'rrca,rrca,rrca,and 0x1F',
                        4 * 3 + 8,
                        [
                            0x0F,
                            0x0F,
                            0x0F,
                            0xE6, 0x1F
                        ]
                    );
                    return 3;
                }
            }
            break;
    }

    return 0;

}


// Exports --------------------------------------------------------------------
module.exports = Optimizer;

