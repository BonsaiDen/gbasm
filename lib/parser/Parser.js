// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Lexer = require('./Lexer');


// Assembly Code Parser -------------------------------------------------------
// ----------------------------------------------------------------------------
function Parser(file) {

    this.file = file;
    this.lexer = new Lexer(file);
    this.stream = this.lexer.getStream();
    this._token = null;
    this._label = null;
    this._mnemonic = null;

}

Parser.prototype = {

    parse: function() {

        while((this._token = this.stream.next())) {

            switch(this._token.type) {

                case 'NAME':
                    this.parseName(this.stream, this._token);
                    break;

                case 'LABEL_GLOBAL_DEF':
                    this.parseLabel(this.stream, this._token);
                    break;

                case 'LABEL_LOCAL_DEF':
                    if (!this._label) {
                        this.file.parseError('local label without parent label', null, this._token.line, this._token.col);
                    }
                    this.file.label(this._token.value, this._label, this._token.line, this._token.col);
                    break;

                case 'MACRO':
                    this.parseMacro(this.stream, this._token);
                    break;

                case 'INSTRUCTION':
                    this.parseInstruction(this.stream, this._token.value.toLowerCase());
                    break;

                case 'COMMENT':
                case 'NEWLINE':
                    break;

                case 'EOF':
                    return;

                default:
                    this.file.parseError(this._token.type, null, this._token.line, this._token.col);
                    break;

            }

        }

    },

    parseName: function(s, name) {

        var value = null;
        if (s.peak('EQU')) {
            s.expect('EQU');


            if (s.peak('EXPRESSION')) {
                value = s.expect('EXPRESSION');

            } else if (s.peak('NAME')) {
                value = s.expect('NAME');

            } else if (s.peak('NUMBER')) {
                value = s.expect('NUMBER');
            }

            if (value !== null) {
                this.file.constant(name.value, value, false, name.line, name.col);
            }

        } else if (s.peak('EQUS')) {
            s.expect('EQUS');

            if (s.peak('EXPRESSION')) {
                value = s.expect('EXPRESSION');

            } else if (s.peak('NAME')) {
                value = s.expect('NAME');

            } else if (s.peak('STRING')) {
                value = s.expect('STRING');
            }

            if (value !== null) {
                this.file.constant(name.value, value, true, name.line, name.col);
            }

        }

    },

    parseLabel: function(s, label) {

        // label: DS $ff
        if (s.peak('DS')) {
            s.expect('DS');
            this.file.variable(label.value, s.expect('NUMBER'), label.line, label.col);

        // label: DB
        } else if (s.peak('DB')) {
            s.expect('DB');
            this.file.variable(label.value, 1, label.line, label.col);

        // label: DW
        } else if (s.peak('DW')) {
            s.expect('DW');
            this.file.variable(label.value, 2, label.line, label.col);

        // label:
        } else {
            this._label = this.file.label(label.value, null, label.line, label.col);
        }

    },

    parseMacro: function(s, token) {

        var name = '',
            segment = '',
            value = null,
            values = [],
            size = 0,
            offset = 0;

        switch(token.value) {

            // INCLUDE "file.gb.s"
            case 'INCLUDE':
                name = s.expect('STRING');
                this.file.include(name.value, name.line, name.col);
                break;

            // SECTION "String",NAME[$Offset]
            case 'SECTION':
                name = s.expect('STRING');
                s.expect(',');
                segment = s.expect('NAME');
                s.expect('[');
                offset = s.expect('NUMBER');
                s.expect(']');
                this.file.section(name, segment.value, offset);
                break;

            // DS 3
            // DS 16 "STRING"
            case 'DS':
                size = s.expect('NUMBER');
                if (s.peak('STRING')) {
                    value = s.expect('STRING');
                    this.file.data([value], true, size);

                } else {
                    this.file.data([], true, size);
                }
                break;

            // DB $ff, $ff, $ff
            // DB "Some Data"
            case 'DB':
                if (s.peak('STRING')) {
                    this.file.data([s.expect('STRING')], true);

                } else {
                    while((value = s.expect('NUMBER_8BIT'))) {

                        values.push(value);

                        if (s.peak(',')) {
                            s.expect(',');

                        } else {
                            this.file.data(values, true);
                            values = [];
                            break;
                        }

                    }
                }
                break;

            // DW $ff, $ff, $ff
            case 'DW':
                while((value = s.expect('NUMBER_16BIT'))) {

                    values.push(value);

                    if (s.peak(',')) {
                        s.expect(',');

                    } else {
                        this.file.data(values, false);
                        values = [];
                        break;
                    }

                }
                break;

            default:
                this.file.parseError(this._token.value, null, this._token.line, this._token.col);
                break;

        }

    },

    parseInstruction: function(s, mnemonic) {

        var left = null,
            right = null,
            arg = null,
            flag = null;

        this._mnemonic = mnemonic;

        switch(mnemonic) {

            // 8bit / 16bit loads
            case 'ld':

                // Accumulator loads
                if (s.peak('ACCUMULATOR')) {
                    left = s.expect('ACCUMULATOR');
                    s.expect(',');

                    // From Memory
                    if (s.peak('[')) {
                        s.expect('[');

                        // ld a,[hli]
                        if (s.peak('REGISTER_HL_INCREMENT')) {
                            s.expect('REGISTER_HL_INCREMENT');
                            s.expect(']');
                            this.instruction(8, [0x2A]);

                        // ld a,[hld]
                        } else if (s.peak('REGISTER_HL_DECREMENT')) {
                            s.expect('REGISTER_HL_DECREMENT');
                            s.expect(']');
                            this.instruction(8, [0x3A]);

                        // ld(h) a,[c]
                        } else if (s.peak('REGISTER_C')) {
                            s.expect('REGISTER_C');
                            s.expect(']');
                            this.instruction(8, [0xF2]);

                        // ld a,[hl]
                        // ld a,[bc]
                        // ld a,[de]
                        } else if (s.peak('REGISTER_DOUBLE')) {
                            right = s.expect('REGISTER_DOUBLE');
                            s.expect(']');
                            this.instruction(8, [{
                                bc: 0x0A,
                                de: 0x1A,
                                hl: 0x7E

                            }[right]]);

                        // ld a,[someLabel]
                        } else {
                            right = s.expect('NUMBER_16BIT');
                            s.expect(']');
                            this.instruction(16, [0xFA], right);
                        }

                    // ld a,a
                    // ld a,b
                    // ld a,c
                    // ld a,d
                    // ld a,e
                    // ld a,h
                    // ld a,l
                    } else if (s.peak('REGISTER_8BIT')) {
                        right = s.expect('REGISTER_8BIT');
                        this.instruction(4, [{
                            a: 0x7F,
                            b: 0x78,
                            c: 0x79,
                            d: 0x7A,
                            e: 0x7B,
                            h: 0x7C,
                            l: 0x7D

                        }[right]]);

                    // ld a,$f
                    } else {
                        right = s.expect('NUMBER_8BIT');
                        this.instruction(8, [0x3E], right, true);
                    }

                // Memory stores
                } else if (s.peak('[')) {
                    s.expect('[');

                    // ld [hli],a
                    if (s.peak('REGISTER_HL_INCREMENT')) {
                        s.expect('REGISTER_HL_INCREMENT');
                        s.expect(']');
                        s.expect(',');
                        s.expect('ACCUMULATOR');
                        this.instruction(8, [0x22]);

                    // ld [hld],a
                    } else if (s.peak('REGISTER_HL_DECREMENT')) {
                        s.expect('REGISTER_HL_DECREMENT');
                        s.expect(']');
                        s.expect(',');
                        s.expect('ACCUMULATOR');
                        this.instruction(8, [0x32]);

                    // ld [hl],a
                    // ld [hl],c
                    // ld [hl],d
                    // ld [hl],e
                    // ld [hl],h
                    // ld [hl],l
                    // ld [hl],$ff
                    } else if (s.peak('REGISTER_HL')) {
                        s.expect('REGISTER_HL');
                        s.expect(']');
                        s.expect(',');

                        // ld [hl],register
                        if (s.peak('REGISTER_8BIT')) {
                            right = s.expect('REGISTER_8BIT');
                            this.instruction(8, [{
                                a: 0x77,
                                b: 0x70,
                                c: 0x71,
                                d: 0x72,
                                e: 0x73,
                                h: 0x74,
                                l: 0x75

                            }[right]]);

                        // ld [hl],$ff
                        } else {
                            right = s.expect('NUMBER_8BIT');
                            this.instruction(8, [0x36], right, true);
                        }

                    // ld(h) [c],a
                    } else if (s.peak('REGISTER_C')) {
                        s.expect('REGISTER_C');
                        s.expect(']');
                        s.expect(',');
                        s.expect('ACCUMULATOR');
                        this.instruction(8, [0xE2]);

                    // ld [de],a
                    // ld [bc],a
                    } else if (s.peak('REGISTER_DOUBLE')) {
                        left = s.expect('REGISTER_DOUBLE');
                        s.expect(']');
                        s.expect(',');
                        s.expect('ACCUMULATOR');
                        this.instruction(8, [{
                            bc: 0x02,
                            de: 0x12

                        }[left]]);

                    // ld [someLabel],??
                    } else {
                        left = s.expect('NUMBER_16BIT');
                        s.expect(']');
                        s.expect(',');

                        // ld [someLabel],sp
                        if (s.peak('REGISTER_SP')) {
                            s.expect('REGISTER_SP');
                            this.instruction(20, [0x08], left);

                        // ld [someLabel],a
                        } else {
                            s.expect('ACCUMULATOR');
                            this.instruction(16, [0xEA], left);
                        }

                    }

                // Stackpointer load
                } else if (s.peak('REGISTER_SP')) {
                    left = s.expect('REGISTER_SP');
                    s.expect(',');

                    // ld sp,hl
                    if (s.peak('REGISTER_HL')) {
                        s.expect('REGISTER_HL');
                        this.instruction(8, [0xF9]);

                    // ld sp,someLabel
                    } else {
                        right = s.expect('NUMBER_16BIT');
                        this.instruction(12, [0x31], right);
                    }

                // 16bit register loads
                } else if (s.peak('REGISTER_DOUBLE')) {

                    left = s.expect('REGISTER_DOUBLE');
                    s.expect(',');
                    right = s.expect('NUMBER_16BIT');

                    // hl,someLabel
                    // bc,someLabel
                    // de,someLabel
                    this.instruction(12, [{
                        bc: 0x01,
                        de: 0x11,
                        hl: 0x21

                    }[left]], right);

                // 8bit register loads (b, c, d, e, h, l)

                // ld b,c
                // ld c,[hl]
                // ld d,$ff
                } else {
                    left = s.expect('REGISTER_8BIT');
                    s.expect(',');

                    // ld ?,[hl]
                    if (s.peak('[')) {
                        s.expect('[');
                        s.expect('REGISTER_HL');
                        s.expect(']');
                        this.instruction(4, [{
                            b: 0x46,
                            c: 0x4E,
                            d: 0x56,
                            e: 0x5E,
                            h: 0x66,
                            l: 0x6E

                        }[left]]);

                    // ld ?,?
                    } else if (s.peak('REGISTER_8BIT')) {
                        right = s.expect('REGISTER_8BIT');

                        this.instruction(4, [{
                            ba: 0x47,
                            bb: 0x40,
                            bc: 0x41,
                            bd: 0x42,
                            be: 0x43,
                            bh: 0x44,
                            bl: 0x45,

                            ca: 0x4F,
                            cb: 0x48,
                            cc: 0x49,
                            cd: 0x4A,
                            ce: 0x4B,
                            ch: 0x4C,
                            cl: 0x4D,

                            da: 0x57,
                            db: 0x50,
                            dc: 0x51,
                            dd: 0x52,
                            de: 0x53,
                            dh: 0x54,
                            dl: 0x55,

                            ea: 0x5F,
                            eb: 0x58,
                            ec: 0x59,
                            ed: 0x5A,
                            ee: 0x5B,
                            eh: 0x5C,
                            el: 0x5D,

                            ha: 0x67,
                            hb: 0x60,
                            hc: 0x61,
                            hd: 0x62,
                            he: 0x63,
                            hh: 0x64,
                            hl: 0x65,

                            la: 0x6F,
                            lb: 0x68,
                            lc: 0x69,
                            ld: 0x6A,
                            le: 0x6B,
                            lh: 0x6C,
                            ll: 0x6D

                        }[left + right]]);

                    // ld c,$ff etc.
                    } else {
                        right = s.expect('NUMBER_8BIT');
                        this.instruction(8, [{
                            b: 0x06,
                            c: 0x0E,
                            d: 0x16,
                            e: 0x1E,
                            h: 0x26,
                            l: 0x2E

                        }[left]], right, true);
                    }
                }
                break;

            case 'ldh':

                // ldh [c],a
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_C');
                    s.expect(']');
                    s.expect(',');
                    s.expect('ACCUMULATOR');
                    this.instruction(8, [0xE2]);

                // ldh a,?
                } else if (s.peak('ACCUMULATOR')) {
                    s.expect('ACCUMULATOR');
                    s.expect(',');

                    // ldh a,[c]
                    if (s.peak('[')) {
                        s.expect('[');
                        s.expect('REGISTER_C');
                        s.expect(']');
                        this.instruction(8, [0xF2]);

                    // ldh a,$ff
                    } else {
                        right = s.expect('NUMBER_8BIT');
                        this.instruction(12, [0xF0], right, true);
                    }

                // ldh $ff,a
                } else {
                    left = s.expect('NUMBER_8BIT');
                    this.instruction(12, [0xE0], left, true);
                }

                break;

            case 'ldhl':
                // ldhl sp,$ff
                s.expect('REGISTER_SP');
                s.expect(',');
                right = s.expect('NUMBER_8BIT');
                this.instruction(12, [0xF8], right, true);
                break;

            case 'push':
                // push hl|de|bc|af
                arg = s.expect('REGISTER_STACKABLE');
                this.instruction(16, [{
                    af: 0xF5,
                    bc: 0xC5,
                    de: 0xD5,
                    hl: 0xE5

                }[arg]]);
                break;

            case 'pop':
                // pop hl|de|bc|af
                arg = s.expect('REGISTER_STACKABLE');
                this.instruction(12, [{
                    af: 0xF1,
                    bc: 0xC1,
                    de: 0xD1,
                    hl: 0xE1

                }[arg]]);
                break;

            // 8 Bit / 16 Bit ALU
            case 'add':
            case 'adc':
            case 'sub':
            case 'sbc':

                // add hl,??
                if (mnemonic === 'add' && s.peak('REGISTER_HL')) {
                    s.expect('REGISTER_HL');
                    s.expect(',');

                    // add hl,sp
                    if (s.peak('REGISTER_SP')) {
                        right = s.expect('REGISTER_SP');
                        this.instruction(8, [0x39]);

                    // add hl,hl|de|bc
                    } else {
                        right = s.expect('REGISTER_DOUBLE');
                        this.instruction(8, [{
                            bc: 0x09,
                            de: 0x19,
                            hl: 0x29

                        }[right]]);
                    }

                // add SP,-2
                // add SP,4
                } else if (mnemonic === 'add' && s.peak('REGISTER_SP')) {
                    s.expect('REGISTER_SP');
                    s.expect(',');
                    right = s.expect('NUMBER_SIGNED_8BIT');
                    this.instruction(16, [0xE8], right, true, true);

                // add a|b|c|d|e|h|l
                // adc a|b|c|d|e|h|l
                // sub a|b|c|d|e|h|l
                // sbc a|b|c|d|e|h|l
                } else if (s.peak('REGISTER_8BIT')) {

                    // add a,?
                    if (s.peakTwo(',')) {
                        s.expect('ACCUMULATOR');
                        s.expect(',');
                    }

                    // add a,r8
                    // adc a,r8
                    // sub a,r8
                    // sbc a,r8
                    if (s.peak('REGISTER_8BIT')) {
                        arg = s.expect('REGISTER_8BIT');
                        switch(mnemonic) {
                            case 'add':
                                this.instruction(4, [{
                                    a: 0x87,
                                    b: 0x80,
                                    c: 0x81,
                                    d: 0x82,
                                    e: 0x83,
                                    h: 0x84,
                                    l: 0x85

                                }[arg]]);
                                break;

                            case 'adc':
                                this.instruction(4, [{
                                    a: 0x8F,
                                    b: 0x88,
                                    c: 0x89,
                                    d: 0x8A,
                                    e: 0x8B,
                                    h: 0x8C,
                                    l: 0x8D

                                }[arg]]);
                                break;

                            case 'sub':
                                this.instruction(4, [{
                                    a: 0x97,
                                    b: 0x90,
                                    c: 0x91,
                                    d: 0x92,
                                    e: 0x93,
                                    h: 0x94,
                                    l: 0x95

                                }[arg]]);
                                break;

                            case 'sbc':
                                this.instruction(4, [{
                                    a: 0x9F,
                                    b: 0x98,
                                    c: 0x99,
                                    d: 0x9A,
                                    e: 0x9B,
                                    h: 0x9C,
                                    l: 0x9D

                                }[arg]]);
                                break;
                        }

                    // add a,[hl]
                    // adc a,[hl]
                    // sub a,[hl]
                    // sbc a,[hl]
                    } else if (s.peak('[')) {
                        s.expect('[');
                        s.expect('REGISTER_HL');
                        s.expect(']');
                        this.instruction(8, [{
                            add: 0x86,
                            adc: 0x8E,
                            sub: 0x96,
                            sbc: 0x9E,

                        }[mnemonic]]);

                    // add a,$ff
                    // adc a,$ff
                    // sub a,$ff
                    // sbc a,$ff
                    } else {
                        arg = s.expect('NUMBER_8BIT');
                        this.instruction(8, [{
                            add: 0xC6,
                            adc: 0xCE,
                            sub: 0xD6,
                            sbc: 0xDE

                        }[mnemonic]], arg, true);
                    }

                // add [hl]
                // adc [hl]
                // sub [hl]
                // sbc [hl]
                } else if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_HL');
                    s.expect(']');
                    this.instruction(8, [{
                        add: 0x86,
                        adc: 0x8E,
                        sub: 0x96,
                        sbc: 0x9E,

                    }[mnemonic]]);

                // add $ff
                // adc $ff
                // sub $ff
                // sbc $ff
                } else {
                    arg = s.expect('NUMBER_8BIT');
                    this.instruction(8, [{
                        add: 0xC6,
                        adc: 0xCE,
                        sub: 0xD6,
                        sbc: 0xDE

                    }[mnemonic]], arg, true);
                }

                break;

            case 'and':
            case 'or':
            case 'xor':
            case 'cp':
                // and [hl]
                // or [hl]
                // xor [hl]
                // cp [hl]
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_HL');
                    s.expect(']');
                    this.instruction(8, [{
                        and: 0xA6,
                        or: 0xB6,
                        xor: 0xAE,
                        cp: 0xBE

                    }[mnemonic]]);

                // and a|b|c|d|e|h|l
                // or a|b|c|d|e|h|l
                // xor a|b|c|d|e|h|l
                // cp a|b|c|d|e|h|l
                } else if (s.peak('REGISTER_8BIT')) {
                    arg = s.expect('REGISTER_8BIT');
                    switch(mnemonic) {
                        case 'and':
                            this.instruction(4, [{
                                a: 0xA7,
                                b: 0xA0,
                                c: 0xA1,
                                d: 0xA2,
                                e: 0xA3,
                                h: 0xA4,
                                l: 0xA5

                            }[arg]]);
                            break;

                        case 'or':
                            this.instruction(4, [{
                                a: 0xB7,
                                b: 0xB0,
                                c: 0xB1,
                                d: 0xB2,
                                e: 0xB3,
                                h: 0xB4,
                                l: 0xB5

                            }[arg]]);
                            break;

                        case 'xor':
                            this.instruction(4, [{
                                a: 0xAF,
                                b: 0xA8,
                                c: 0xA9,
                                d: 0xAA,
                                e: 0xAB,
                                h: 0xAC,
                                l: 0xAD

                            }[arg]]);
                            break;

                        case 'cp':
                            this.instruction(4, [{
                                a: 0xBF,
                                b: 0xB8,
                                c: 0xB9,
                                d: 0xBA,
                                e: 0xBB,
                                h: 0xBC,
                                l: 0xBD

                            }[arg]]);
                            break;
                    }

                // and $ff
                // or $ff
                // xor $ff
                // cp $ff
                } else {
                    arg = s.expect('NUMBER_8BIT');
                    this.instruction(8, [{
                        and: 0xE6,
                        or: 0xF6,
                        xor: 0xEE,
                        cp: 0xFE

                    }[mnemonic]], arg, true);
                }
                break;

            case 'inc':
            case 'dec':
                // inc [hl]
                // dec [hl]
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_HL');
                    s.expect(']');
                    if (mnemonic === 'inc') {
                        this.instruction(12, [0x34]);

                    } else {
                        this.instruction(12, [0x35]);
                    }

                // inc hl|de|bc
                // dec hl|de|bc
                } else if (s.peak('REGISTER_DOUBLE')) {
                    arg = s.expect('REGISTER_DOUBLE');
                    if (mnemonic === 'inc') {
                        this.instruction(12, [{
                            bc: 0x03,
                            de: 0x13,
                            hl: 0x23

                        }[arg]]);

                    } else {
                        this.instruction(12, [{
                            bc: 0x0B,
                            de: 0x1B,
                            hl: 0x2B

                        }[arg]]);
                    }

                // inc sp
                // dec sp
                } else if (s.peak('REGISTER_SP')) {
                    s.expect('REGISTER_SP');
                    if (mnemonic === 'inc') {
                        this.instruction(8, [0x33]);

                    } else {
                        this.instruction(8, [0x3B]);
                    }

                // inc a|b|c|d|h|l
                // dec a|b|c|d|h|l
                } else {
                    arg = s.expect('REGISTER_8BIT');
                    if (mnemonic === 'inc') {
                        this.instruction(4, [{
                            a: 0x3C,
                            b: 0x04,
                            c: 0x0C,
                            d: 0x14,
                            e: 0x1C,
                            h: 0x24,
                            l: 0x2C

                        }[arg]]);

                    } else {
                        this.instruction(4, [{
                            a: 0x3D,
                            b: 0x05,
                            c: 0x0D,
                            d: 0x15,
                            e: 0x1D,
                            h: 0x25,
                            l: 0x2D

                        }[arg]]);
                    }
                }
                break;

            // Miscellaneous
            case 'swap':
                // swap [hl]
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_HL');
                    s.expect(']');
                    this.instruction(16, [0xCB, 0x36]);

                // swap a|b|c|d|h|l
                } else {
                    arg = s.expect('REGISTER_8BIT');
                    this.instruction(8, [0xCB, {
                        a: 0x37,
                        b: 0x30,
                        c: 0x31,
                        d: 0x32,
                        e: 0x33,
                        h: 0x34,
                        l: 0x35

                    }[arg]]);

                }
                break;

            case 'daa':
                this.instruction(4, [0x27]);
                break;

            case 'cpl':
                this.instruction(4, [0x2F]);
                break;

            case 'ccf':
                this.instruction(4, [0x3F]);
                break;

            case 'scf':
                this.instruction(4, [0x37]);
                break;

            case 'nop':
                this.instruction(4, [0x00]);
                break;

            case 'halt':
                this.instruction(4, [0x76]);
                break;

            case 'di':
                this.instruction(4, [0xF3]);
                break;

            case 'ei':
                this.instruction(4, [0xFB]);
                break;

            case 'stop':
                this.instruction(4, [0x10, 0x00]);
                break;

            // Rotates and Shifts Accumulator
            case 'rlca':
            case 'rla':
            case 'rrca':
            case 'rra':
                this.instruction(4, [{
                    rlca: 0x07,
                    rla: 0x17,
                    rrca: 0x0F,
                    rra: 0x1F

                }[mnemonic]]);
                break;

            // Rotates and Shifts Registers
            case 'rlc':
            case 'rl':
            case 'rrc':
            case 'rr':
            case 'sla':
            case 'sra':
            case 'srl':
                // rlc [hl]
                // rl [hl]
                // rrc [hl]
                // rr [hl]
                // sla [hl]
                // sra [hl]
                // srl [hl]
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_HL');
                    s.expect(']');
                    this.instruction(16, [0xCB, {
                        rlc: 0x06,
                        rl: 0x16,
                        rrc: 0x0E,
                        rr: 0x1E,
                        sla: 0x26,
                        sra: 0x2E,
                        srl: 0x3E

                    }[mnemonic]]);

                // rlc a|b|c|d|e|h|l
                // rl a|b|c|d|e|h|l
                // rrc a|b|c|d|e|h|l
                // rr a|b|c|d|e|h|l
                // sla a|b|c|d|e|h|l
                // sra a|b|c|d|e|h|l
                // srl a|b|c|d|e|h|l
                } else {
                    arg = s.expect('REGISTER_8BIT');
                    switch(mnemonic) {
                        case 'rlc':
                            this.instruction(8, [0xCB, {
                                a: 0x07,
                                b: 0x00,
                                c: 0x01,
                                d: 0x02,
                                e: 0x03,
                                h: 0x04,
                                l: 0x05

                            }[arg]]);
                            break;

                        case 'rl':
                            this.instruction(8, [0xCB, {
                                a: 0x17,
                                b: 0x10,
                                c: 0x11,
                                d: 0x12,
                                e: 0x13,
                                h: 0x14,
                                l: 0x15

                            }[arg]]);
                            break;

                        case 'rrc':
                            this.instruction(8, [0xCB, {
                                a: 0x0F,
                                b: 0x08,
                                c: 0x09,
                                d: 0x0A,
                                e: 0x0B,
                                h: 0x0C,
                                l: 0x0D

                            }[arg]]);
                            break;

                        case 'rr':
                            this.instruction(8, [0xCB, {
                                a: 0x1F,
                                b: 0x18,
                                c: 0x19,
                                d: 0x1A,
                                e: 0x1B,
                                h: 0x1C,
                                l: 0x1D

                            }[arg]]);
                            break;

                        case 'sla':
                            this.instruction(8, [0xCB, {
                                a: 0x27,
                                b: 0x20,
                                c: 0x21,
                                d: 0x22,
                                e: 0x23,
                                h: 0x24,
                                l: 0x25

                            }[arg]]);
                            break;

                        case 'sra':
                            this.instruction(8, [0xCB, {
                                a: 0x2F,
                                b: 0x28,
                                c: 0x29,
                                d: 0x2A,
                                e: 0x2B,
                                h: 0x2C,
                                l: 0x2D

                            }[arg]]);
                            break;

                        case 'srl':
                            this.instruction(8, [0xCB, {
                                a: 0x3F,
                                b: 0x38,
                                c: 0x39,
                                d: 0x3A,
                                e: 0x3B,
                                h: 0x3C,
                                l: 0x3D

                            }[arg]]);
                            break;
                    }
                }
                break;

            // Bit Op Codes
            case 'bit':
            case 'set':
            case 'res':
                left = s.expect('NUMBER_BIT_INDEX').value;
                arg = [0, 8, 16, 24, 32, 40, 48, 56][left];
                s.expect(',');

                // bit 0-7,[hl]
                // res 0-7,[hl]
                // set 0-7,[hl]
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_HL');
                    s.expect(']');
                    if (mnemonic === 'bit') {
                        this.instruction(12, [0xCB, 0x46 + arg], false, false, true);

                    } else if (mnemonic === 'set') {
                        this.instruction(16, [0xCB, 0xC6 + arg], false, false, true);

                    } else if (mnemonic === 'res') {
                        this.instruction(16, [0xCB, 0x86 + arg], false, false, true);
                    }

                // bit 0-7,a|b|c|d|e|h|l
                // res 0-7,a|b|c|d|e|h|l
                // set 0-7,a|b|c|d|e|h|l
                } else {
                    right = s.expect('REGISTER_8BIT');
                    if (mnemonic === 'bit') {
                        this.instruction(8, [0xCB, {
                            a: 0x47,
                            b: 0x40,
                            c: 0x41,
                            d: 0x42,
                            e: 0x43,
                            h: 0x44,
                            l: 0x45

                        }[right] + arg], false, false, true);

                    } else if (mnemonic === 'set') {
                        this.instruction(8, [0xCB, {
                            a: 0xC7,
                            b: 0xC0,
                            c: 0xC1,
                            d: 0xC2,
                            e: 0xC3,
                            h: 0xC4,
                            l: 0xC5

                        }[right] + arg], false, false, true);

                    } else if (mnemonic === 'res') {
                        this.instruction(8, [0xCB, {
                            a: 0x87,
                            b: 0x80,
                            c: 0x81,
                            d: 0x82,
                            e: 0x83,
                            h: 0x84,
                            l: 0x85

                        }[right] + arg], false, false, true);
                    }

                }
                break;

            // Jumps
            case 'jp':
                // jp [hl]
                if (s.peak('[')) {
                    s.expect('[');
                    arg = s.expect('REGISTER_HL');
                    s.expect(']');
                    this.instruction(4, [0xE9]);

                // jp c,label
                // jp nc,label
                // jp z,label
                // jp nz,label
                } else if (s.peak('FLAG')) {
                    flag = s.expect('FLAG');
                    s.expect(',');
                    arg = s.expect('NUMBER_16BIT');
                    switch(flag) {
                        case 'c':
                            this.instruction(16, [0xDA], arg);
                            break;

                        case 'nc':
                            this.instruction(16, [0xD2], arg);
                            break;

                        case 'z':
                            this.instruction(16, [0xCA], arg);
                            break;

                        case 'nz':
                            this.instruction(16, [0xC2], arg);
                            break;
                    }

                // jp label
                } else {
                    arg = s.expect('NUMBER_16BIT');
                    this.instruction(16, [0xC3], arg);
                }
                break;

            case 'jr':
                // jr c,label
                // jr nc,label
                // jr z,label
                // jr nz,label
                if (s.peak('FLAG')) {
                    flag = s.expect('FLAG');
                    s.expect(',');
                    arg = s.expect('NUMBER_16BIT');

                    switch(flag) {
                        case 'c':
                            this.instruction(12, [0x38], arg, true, true);
                            break;

                        case 'nc':
                            this.instruction(12, [0x30], arg, true, true);
                            break;

                        case 'z':
                            this.instruction(12, [0x28], arg, true, true);
                            break;

                        case 'nz':
                            this.instruction(12, [0x20], arg, true, true);
                            break;
                    }

                // jr label
                } else {
                    arg = s.expect('NUMBER_16BIT');
                    this.instruction(12, [0x18], arg, true, true);
                }
                break;

            // Calls
            case 'call':
                // call c,label
                // call nc,label
                // call z,label
                // call nz,label
                if (s.peak('FLAG')) {
                    flag = s.expect('FLAG');
                    s.expect(',');
                    arg = s.expect('NUMBER_16BIT');

                    switch(flag) {
                        case 'c':
                            this.instruction(24, [0xDC], arg);
                            break;

                        case 'nc':
                            this.instruction(24, [0xD4], arg);
                            break;

                        case 'z':
                            this.instruction(24, [0xCC], arg);
                            break;

                        case 'nz':
                            this.instruction(24, [0xC4], arg);
                            break;
                    }

                // call label
                } else {
                    arg = s.expect('NUMBER_16BIT');
                    this.instruction(24, [0xCD], arg);
                }
                break;

            // Restarts
            case 'rst':
                // rst $0048
                arg = s.expect('ZERO_PAGE_LOCATION');
                switch(arg) {
                    case 0x00:
                        this.instruction(16, [0xC7]);
                        break;

                    case 0x08:
                        this.instruction(16, [0xCF]);
                        break;

                    case 0x10:
                        this.instruction(16, [0xD7]);
                        break;

                    case 0x18:
                        this.instruction(16, [0xDF]);
                        break;

                    case 0x20:
                        this.instruction(16, [0xE7]);
                        break;

                    case 0x28:
                        this.instruction(16, [0xEF]);
                        break;

                    case 0x30:
                        this.instruction(16, [0xF7]);
                        break;

                    case 0x38:
                        this.instruction(16, [0xFF]);
                        break;
                }
                break;

            // Returns
            case 'ret':
                // ret c
                // ret nc
                // ret z
                // ret nz
                if (s.peak('FLAG')) {
                    flag = s.expect('FLAG');
                    switch(flag) {
                        case 'c':
                            this.instruction(20, [0xD8]);
                            break;

                        case 'nc':
                            this.instruction(20, [0xD0]);
                            break;

                        case 'z':
                            this.instruction(20, [0xC8]);
                            break;

                        case 'nz':
                            this.instruction(20, [0xC0]);
                            break;
                    }

                } else {
                    this.instruction(16, [0xC9]);
                }
                break;

            case 'reti':
                this.instruction(16, [0xD9]);
                break;

            default:
                throw new TypeError('Unknown mnemonic: ' + mnemonic);

        }

    },

    instruction: function(cycles, code, arg, isByte, isSigned, isBit) {
        this.file.instruction(
            this._mnemonic,
            cycles,
            code,
            arg,
            isByte,
            isSigned,
            isBit,
            this._token.line,
            this._token.col
        );
    }

};


// Exports --------------------------------------------------------------------
module.exports = Parser;

