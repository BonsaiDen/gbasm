// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Lexer = require('./Lexer'),
    Expression = require('./Expression'),
    Errors = require('../Errors');


// Assembly Code Parser -------------------------------------------------------
// ----------------------------------------------------------------------------
function Parser(file, stream) {
    this.file = file;
    this.stream = stream;

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
                        this.error('local label without parent label', null, this._token.index);
                    }
                    this.file.addLabel(this._token.value, this._label, this._token.index);
                    break;

                case 'DIRECTIVE':
                    this.parseDirective(this.stream, this._token);
                    break;

                case 'INSTRUCTION':
                    this.parseInstruction(this.stream, this._token.value.toLowerCase());
                    break;

                case 'MACRO':
                    this.parseMacro(this.stream, this._token);
                    break;

                case 'NEWLINE':
                    break;

                case 'EOF':
                    return;

                case 'EXPRESSION':

                    // Only macro calls are allow at the top level
                    if (this._token.value instanceof Expression.Call) {
                        this.file.addMacroCall(this._token, this._token.index);

                    } else {
                        this.error(this._token.type, 'NAME, LABEL_GLOBAL_DEF, LABEL_LOCAL_DEF, DIRECTIVE, INSTRUCTION, NEWLINE or EOF', this._token.index);
                    }
                    break;

                default:
                    this.error(this._token.type, 'NAME, LABEL_GLOBAL_DEF, LABEL_LOCAL_DEF, DIRECTIVE, INSTRUCTION, NEWLINE or EOF', this._token.index);
                    break;

            }

        }

    },

    parseName: function(s, name) {

        var value = null;
        if (s.peak('EQU')) {
            s.expect('EQU');

            if (s.peak('EXPRESSION')) {
                value = s.get('EXPRESSION');

            } else if (s.peak('NUMBER')) {
                value = s.get('NUMBER');
            }

            if (value !== null) {
                this.file.addConstant(name.value, value, name.index);
            }

        } else if (s.peak('EQUS')) {
            s.expect('EQUS');

            if (s.peak('EXPRESSION')) {
                value = s.get('EXPRESSION');

            } else if (s.peak('STRING')) {
                value = s.get('STRING');
            }

            if (value !== null) {
                this.file.addConstant(name.value, value, name.index);
            }

        } else {
            this.error(name.type, null, name.index);
        }

    },

    parseLabel: function(s, label) {

        // label: DS $ff
        if (s.peak('DS')) {
            s.expect('DS');

            var size;
            if (s.peak('NUMBER')) {
                size = s.get('NUMBER');

            } else {
                size = s.get('EXPRESSION');
            }
            this.file.addVariable(label.value, size, label.index);

        // label: DB
        } else if (s.peak('DB')) {
            s.expect('DB');
            this.file.addVariable(label.value, 1, label.index);

        // label: DW
        } else if (s.peak('DW')) {
            s.expect('DW');
            this.file.addVariable(label.value, 2, label.index);

        // label:
        } else {
            this._label = this.file.addLabel(label.value, null, label.index);
        }

    },

    parseDirective: function(s, token) {

        var name = '';
        switch(token.value) {

            // INCLUDE "file.gb.s"
            case 'INCLUDE':
                name = s.get('STRING');
                this.file.include(name.value, name.index);
                break;

            // INCBIN "file.bin"
            case 'INCBIN':
                name = s.get('STRING');
                this.file.addBinaryInclude(name, name.index);
                break;

            // SECTION "Optional Name",SEGMENT,BANK[ID]
            // SECTION "Optional Name",SEGMENT[Offset],BANK[ID]
            case 'SECTION':
                this.parseSection(s);
                break;

            // DS 3
            // DS 16 "STRING"
            case 'DS':
                this.parseDS(s);
                break;

            // DB $ff, $ff, $ff
            // DB "String"
            case 'DB':
                this.parseDB(s);
                break;

            // DW $ff, $ff, $ff
            case 'DW':
                this.parseDW(s);
                break;

            default:
                this.error(this._token.value, null, this._token.index);
                break;

        }

    },

    parseSection: function(s) {

        var segment, name, offset, bank;

        // Optional segment name (description)
        if (s.peak('STRING')) {
            name = s.get('STRING');
            s.expect('COMMA');

        } else {
            name = new Lexer.Token('STRING', 'Unnamed Section');
        }

        // SECTION ??,ROMX
        segment = s.get('NAME');

        // SECTION ??,ROMX[??]
        if (s.peak('[')) {
            s.expect('[');
            offset = s.get('NUMBER');
            s.expect(']');

            // Optional Bank
            if (s.peak('COMMA')) {
                s.expect('COMMA');
                s.expect('BANK');
                s.expect('[');
                bank = s.get('NUMBER');
                s.expect(']');

            } else {
                bank = null;
            }

        } else {

            offset = null;

            if (s.peak('COMMA')) {
                s.expect('COMMA');
                s.expect('BANK');
                s.expect('[');
                bank = s.get('NUMBER');
                s.expect(']');

            } else {
                bank = 0;
            }

        }

        this.file.addSection(name, segment, bank, offset);

    },

    parseDS: function(s) {

        var size = s.peak('NUMBER') ? s.expect('NUMBER') : s.expect('EXPRESSION');
        if (s.peak('EXPRESSION')) {
            this.file.addDataBlock([s.get('EXPRESSION')], true, size, this._token.index);

        } else if (s.peak('STRING')) {
            this.file.addDataBlock([s.get('STRING')], true, size, this._token.index);

        } else {
            this.file.addDataBlock([], true, size, this._token.index);
        }

    },

    parseDB: function(s) {

        var value, values = [];
        if (s.peak('STRING')) {
            while((value = s.get('STRING'))) {

                var string = value.value.split('');
                values.push.apply(values, string.map(function(c, i) {
                    return new Lexer.Token('NUMBER', c.charCodeAt(0), value.index + i);
                }));

                if (s.peak('COMMA')) {
                    s.expect('COMMA');

                } else {
                    this.file.addDataBlock(values, true, null, this._token.index);
                    values = [];
                    break;
                }

            }

        } else {
            while((value = s.get('NUMBER_8BIT'))) {

                values.push(value);

                if (s.peak('COMMA')) {
                    s.expect('COMMA');

                } else {
                    this.file.addDataBlock(values, true, null, this._token.index);
                    values = [];
                    break;
                }

            }
        }

    },

    parseDW: function(s) {

        var value, values = [];
        while((value = s.get('NUMBER_16BIT'))) {

            values.push(value);

            if (s.peak('COMMA')) {
                s.expect('COMMA');

            } else {
                this.file.addDataBlock(values, false, null, this._token.index);
                values = [];
                break;
            }

        }

    },

    // MACRO name(arg1, ...)
    // ...
    // ENDMACRO
    parseMacro: function(s, token) {

        var args = [],
            tokens = [];

        // Parse arguments
        s.expect('LPAREN');
        if (!s.peak('RPAREN')) {
            while(true) {

                args.push(s.get('MACRO_ARG'));
                if (!s.peak('COMMA')) {
                    break;

                } else {
                    s.expect('COMMA');
                }

            }

        }

        s.expect('RPAREN');

        // Parse Body
        if (!s.peak('ENDMACRO')) {

            while(true) {

                if (s.peak('ENDMACRO')) {
                    break;

                } else {
                    tokens.push(s.next());
                }

            }

            // Trim leading / trailing newlines
            var start = -1,
                end = -1,
                length = tokens.length;

            for(var i = 0; i < length; i++) {
                if (start === -1 && tokens[i].type !== 'NEWLINE') {
                    start = i;
                }

                if (end === -1 && tokens[length - 1 - i].type !== 'NEWLINE') {
                    end = length - i;
                }
            }

            tokens = tokens.slice(start, end);

        }

        tokens.push(new Lexer.Token('EOF', '', 0, this.file));

        s.expect('ENDMACRO');

        this.file.addMacro(token.value, args, tokens, token.index);

    },

    parseInstruction: function(s, mnemonic) {

        var arg = null,
            flag = null;

        this._mnemonic = mnemonic;

        switch(mnemonic) {

            // 8bit / 16bit loads
            case 'ld':
                this.parseLdInstruction(s);
                break;

            case 'ldh':

                // ldh [c],a
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_C');
                    s.expect(']');
                    s.expect('COMMA');
                    s.expect('ACCUMULATOR');
                    this.instruction(8, [0xE2]);

                // ldh a,?
                } else if (s.peak('ACCUMULATOR')) {
                    s.expect('ACCUMULATOR');
                    s.expect('COMMA');

                    // ldh a,[c]
                    if (s.peak('[')) {
                        s.expect('[');
                        s.expect('REGISTER_C');
                        s.expect(']');
                        this.instruction(8, [0xF2]);

                    // ldh a,$ff
                    } else {
                        this.instruction(12, [0xF0], s.get('NUMBER_8BIT'), true);
                    }

                // ldh $ff,a
                } else {
                    this.instruction(12, [0xE0], s.get('NUMBER_8BIT'), true);
                    s.expect('COMMA');
                    s.expect('ACCUMULATOR');
                }

                break;

            case 'ldhl':
                // ldhl sp,$ff
                s.expect('REGISTER_SP');
                s.expect('COMMA');
                this.instruction(12, [0xF8], s.get('NUMBER_8BIT'), true);
                break;

            case 'push':
                // push hl|de|bc|af
                this.instruction(16, [{
                    af: 0xF5,
                    bc: 0xC5,
                    de: 0xD5,
                    hl: 0xE5

                }[s.get('REGISTER_STACKABLE')]]);
                break;

            case 'pop':
                // pop hl|de|bc|af
                this.instruction(12, [{
                    af: 0xF1,
                    bc: 0xC1,
                    de: 0xD1,
                    hl: 0xE1

                }[s.get('REGISTER_STACKABLE')]]);
                break;

            // 8 Bit / 16 Bit ALU
            case 'add':
            case 'adc':
            case 'sub':
            case 'sbc':
                this.parseAddSubInstruction(s, mnemonic);
                break;

            case 'and':
            case 'or':
            case 'xor':
            case 'cp':
                this.parseAndXorInstruction(s, mnemonic);
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
                    arg = s.get('REGISTER_DOUBLE');
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
                    arg = s.get('REGISTER_8BIT');
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
                    this.instruction(8, [0xCB, {
                        a: 0x37,
                        b: 0x30,
                        c: 0x31,
                        d: 0x32,
                        e: 0x33,
                        h: 0x34,
                        l: 0x35

                    }[s.get('REGISTER_8BIT')]]);

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
                this.parseShiftInstruction(s, mnemonic);
                break;

            // Bit Op Codes
            case 'bit':
            case 'set':
            case 'res':
                this.parseBitInstruction(s, mnemonic);
                break;

            // Jumps
            case 'jp':
                // jp [hl]
                if (s.peak('[')) {
                    s.expect('[');
                    s.expect('REGISTER_HL');
                    s.expect(']');
                    this.instruction(4, [0xE9]);

                // jp c,label
                // jp nc,label
                // jp z,label
                // jp nz,label
                } else if (s.peak('FLAG')) {
                    flag = s.get('FLAG');
                    s.expect('COMMA');
                    arg = s.get('NUMBER_16BIT');
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
                    this.instruction(16, [0xC3], s.get('NUMBER_16BIT'));
                }
                break;

            case 'jr':
                // jr c,label
                // jr nc,label
                // jr z,label
                // jr nz,label
                if (s.peak('FLAG')) {
                    flag = s.get('FLAG');
                    s.expect('COMMA');

                    // For offset labels we need to record the target instruction
                    if (s.peak('OFFSET')) {
                        arg = s.get('OFFSET');

                    } else {
                        arg = s.get('NUMBER_16BIT');
                    }

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
                    if (s.peak('OFFSET')) {
                        arg = s.get('OFFSET');

                    } else {
                        arg = s.get('NUMBER_16BIT');
                    }
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
                    flag = s.get('FLAG');
                    s.expect('COMMA');
                    arg = s.get('NUMBER_16BIT');

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
                    this.instruction(24, [0xCD], s.get('NUMBER_16BIT'));
                }
                break;

            // Restarts
            case 'rst':
                // rst $0048
                switch(s.expect('ZERO_PAGE_LOCATION')) {
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
                    flag = s.get('FLAG');
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

        }

    },

    parseLdInstruction: function(s) {

        var left = null,
            right = null;

        // Accumulator loads
        if (s.peak('ACCUMULATOR')) {
            left = s.get('ACCUMULATOR');
            s.expect('COMMA');

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
                    right = s.get('REGISTER_DOUBLE');
                    s.expect(']');
                    this.instruction(8, [{
                        bc: 0x0A,
                        de: 0x1A,
                        hl: 0x7E

                    }[right]]);

                // ld a,[someLabel]
                } else {
                    right = s.get('NUMBER_16BIT');
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
                this.instruction(4, [{
                    a: 0x7F,
                    b: 0x78,
                    c: 0x79,
                    d: 0x7A,
                    e: 0x7B,
                    h: 0x7C,
                    l: 0x7D

                }[s.get('REGISTER_8BIT')]]);

            // ld a,$ff
            } else {
                this.instruction(8, [0x3E], s.get('NUMBER_8BIT'), true);
            }

        // Memory stores
        } else if (s.peak('[')) {
            s.expect('[');

            // ld [hli],a
            if (s.peak('REGISTER_HL_INCREMENT')) {
                s.expect('REGISTER_HL_INCREMENT');
                s.expect(']');
                s.expect('COMMA');
                s.expect('ACCUMULATOR');
                this.instruction(8, [0x22]);

            // ld [hld],a
            } else if (s.peak('REGISTER_HL_DECREMENT')) {
                s.expect('REGISTER_HL_DECREMENT');
                s.expect(']');
                s.expect('COMMA');
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
                s.expect('COMMA');

                // ld [hl],register
                if (s.peak('REGISTER_8BIT')) {
                    this.instruction(8, [{
                        a: 0x77,
                        b: 0x70,
                        c: 0x71,
                        d: 0x72,
                        e: 0x73,
                        h: 0x74,
                        l: 0x75

                    }[s.get('REGISTER_8BIT')]]);

                // ld [hl],$ff
                } else {
                    this.instruction(8, [0x36], s.get('NUMBER_8BIT'), true);
                }

            // ld(h) [c],a
            } else if (s.peak('REGISTER_C')) {
                s.expect('REGISTER_C');
                s.expect(']');
                s.expect('COMMA');
                s.expect('ACCUMULATOR');
                this.instruction(8, [0xE2]);

            // ld [de],a
            // ld [bc],a
            } else if (s.peak('REGISTER_DOUBLE')) {
                left = s.get('REGISTER_DOUBLE');
                s.expect(']');
                s.expect('COMMA');
                s.expect('ACCUMULATOR');
                this.instruction(8, [{
                    bc: 0x02,
                    de: 0x12

                }[left]]);

            // ld [someLabel],??
            } else {
                left = s.get('NUMBER_16BIT');
                s.expect(']');
                s.expect('COMMA');

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
            left = s.get('REGISTER_SP');
            s.expect('COMMA');

            // ld sp,hl
            if (s.peak('REGISTER_HL')) {
                s.expect('REGISTER_HL');
                this.instruction(8, [0xF9]);

            // ld sp,someLabel
            } else {
                this.instruction(12, [0x31], s.get('NUMBER_16BIT'));
            }

        // 16bit register loads
        } else if (s.peak('REGISTER_DOUBLE')) {

            left = s.get('REGISTER_DOUBLE');
            s.expect('COMMA');

            // ld hl,someLabel
            // ld bc,someLabel
            // ld de,someLabel
            // ld hl,$ffff
            // ld bc,$ffff
            // ld de,$ffff
            this.instruction(12, [{
                bc: 0x01,
                de: 0x11,
                hl: 0x21

            }[left]], s.get('NUMBER_16BIT'));

        // 8bit register loads (b, c, d, e, h, l)

        // ld b,c
        // ld c,[hl]
        // ld d,$ff
        } else {
            left = s.get('REGISTER_8BIT');
            s.expect('COMMA');

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

                }[left + s.expect('REGISTER_8BIT')]]);

            // ld c,$ff etc.
            } else {
                this.instruction(8, [{
                    b: 0x06,
                    c: 0x0E,
                    d: 0x16,
                    e: 0x1E,
                    h: 0x26,
                    l: 0x2E

                }[left]], s.get('NUMBER_8BIT'), true);
            }
        }

    },

    parseAndXorInstruction: function(s, mnemonic) {

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

            var reg = {
                a: 0x07,
                b: 0x00,
                c: 0x01,
                d: 0x02,
                e: 0x03,
                h: 0x04,
                l: 0x05
            };

            var m = {
                and: 0xA0,
                or:  0xB0,
                xor: 0xA8,
                cp:  0xB8
            };

            this.instruction(4, [reg[s.get('REGISTER_8BIT')] + m[mnemonic]]);

        // and $ff
        // or $ff
        // xor $ff
        // cp $ff
        } else {
            this.instruction(8, [{
                and: 0xE6,
                or: 0xF6,
                xor: 0xEE,
                cp: 0xFE

            }[mnemonic]], s.get('NUMBER_8BIT'), true);
        }

    },

    parseAddSubInstruction: function(s, mnemonic) {

        // add hl,??
        if (mnemonic === 'add' && s.peak('REGISTER_HL')) {
            s.expect('REGISTER_HL');
            s.expect('COMMA');

            // add hl,sp
            if (s.peak('REGISTER_SP')) {
                s.expect('REGISTER_SP');
                this.instruction(8, [0x39]);

            // add hl,hl
            // add hl,de
            // add hl,bc
            } else {
                this.instruction(8, [{
                    bc: 0x09,
                    de: 0x19,
                    hl: 0x29

                }[s.get('REGISTER_DOUBLE')]]);
            }

        // add SP,-2
        // add SP,4
        } else if (mnemonic === 'add' && s.peak('REGISTER_SP')) {
            s.expect('REGISTER_SP');
            s.expect('COMMA');
            this.instruction(16, [0xE8], s.get('NUMBER_SIGNED_8BIT'), true, true);

        // add a|b|c|d|e|h|l
        // adc a|b|c|d|e|h|l
        // sub a|b|c|d|e|h|l
        // sbc a|b|c|d|e|h|l
        } else if (s.peak('REGISTER_8BIT')) {

            // add a,?
            if (s.peak('ACCUMULATOR')) {

                s.expect('ACCUMULATOR');

                if (s.peak('COMMA')) {
                    s.expect('COMMA');
                    this.parseAddSubInstructionOperand(s, mnemonic);

                } else {
                    // add a
                    // adc a
                    // sub a
                    // sbc a
                    this.instruction(4, [{
                        add: 0x87,
                        adc: 0x8F,
                        sub: 0x97,
                        sbc: 0x9F

                    }[mnemonic]]);
                }

            // add r8/value
            } else {
                this.parseAddSubInstructionOperand(s, mnemonic);
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
            this.instruction(8, [{
                add: 0xC6,
                adc: 0xCE,
                sub: 0xD6,
                sbc: 0xDE

            }[mnemonic]], s.get('NUMBER_8BIT'), true);
        }

    },

    parseAddSubInstructionOperand: function(s, mnemonic) {

        // add a,r8 or add r8
        // adc a,r8 or adc r8
        // sub a,r8 or sub r8
        // sbc a,r8 or sbc r8
        if (s.peak('REGISTER_8BIT')) {

            var reg = {
                a: 0x07,
                b: 0x00,
                c: 0x01,
                d: 0x02,
                e: 0x03,
                h: 0x04,
                l: 0x05
            };

            var m = {
                add: 0x80,
                adc: 0x88,
                sub: 0x90,
                sbc: 0x98
            };

            this.instruction(4, [reg[s.get('REGISTER_8BIT')] + m[mnemonic]]);

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
            this.instruction(8, [{
                add: 0xC6,
                adc: 0xCE,
                sub: 0xD6,
                sbc: 0xDE

            }[mnemonic]], s.get('NUMBER_8BIT'), true);
        }

    },

    parseShiftInstruction: function(s, mnemonic) {

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
        // rl  a|b|c|d|e|h|l
        // rrc a|b|c|d|e|h|l
        // rr  a|b|c|d|e|h|l
        // sla a|b|c|d|e|h|l
        // sra a|b|c|d|e|h|l
        // srl a|b|c|d|e|h|l
        } else {

            // Register offset
            var reg = {
                a: 0x07,
                b: 0x00,
                c: 0x01,
                d: 0x02,
                e: 0x03,
                h: 0x04,
                l: 0x05
            };

            // Mnemonic Offset
            var m = {
                rlc: 0x00,
                rl:  0x10,
                rrc: 0x08,
                rr:  0x18,
                sla: 0x20,
                sra: 0x28,
                srl: 0x38
            };

            this.instruction(8, [0xCB, reg[s.get('REGISTER_8BIT')] + m[mnemonic]]);

        }

    },

    parseBitInstruction: function(s, mnemonic) {

        var arg = [
            0, 8, 16, 24, 32, 40, 48, 56

        ][s.get('NUMBER_BIT_INDEX').value];

        s.expect('COMMA');

        // bit 0-7,[hl]
        // res 0-7,[hl]
        // set 0-7,[hl]
        if (s.peak('[')) {
            s.expect('[');
            s.expect('REGISTER_HL');
            s.expect(']');
            if (mnemonic === 'bit') {
                this.instruction(12, [0xCB, 0x46 + arg], null, false, false, true);

            } else if (mnemonic === 'set') {
                this.instruction(16, [0xCB, 0xC6 + arg], null, false, false, true);

            } else if (mnemonic === 'res') {
                this.instruction(16, [0xCB, 0x86 + arg], null, false, false, true);
            }

        // bit 0-7,a|b|c|d|e|h|l
        // res 0-7,a|b|c|d|e|h|l
        // set 0-7,a|b|c|d|e|h|l
        } else {
            var right = s.get('REGISTER_8BIT');
            if (mnemonic === 'bit') {
                this.instruction(8, [0xCB, {
                    a: 0x47,
                    b: 0x40,
                    c: 0x41,
                    d: 0x42,
                    e: 0x43,
                    h: 0x44,
                    l: 0x45

                }[right] + arg], null, false, false, true);

            } else if (mnemonic === 'set') {
                this.instruction(8, [0xCB, {
                    a: 0xC7,
                    b: 0xC0,
                    c: 0xC1,
                    d: 0xC2,
                    e: 0xC3,
                    h: 0xC4,
                    l: 0xC5

                }[right] + arg], null, false, false, true);

            } else if (mnemonic === 'res') {
                this.instruction(8, [0xCB, {
                    a: 0x87,
                    b: 0x80,
                    c: 0x81,
                    d: 0x82,
                    e: 0x83,
                    h: 0x84,
                    l: 0x85

                }[right] + arg], null, false, false, true);
            }

        }

    },

    instruction: function(cycles, code, arg, isByte, isSigned, isBit) {
        this.file.addInstruction(
            this._mnemonic,
            cycles,
            code,
            arg,
            isByte,
            isSigned,
            isBit,
            this._token.index
        );
    },


    // Error Handling ---------------------------------------------------------
    error: function(msg, expected, index) {
        new Errors.ParseError(this.file, msg, expected, index);
    }

};


// Exports --------------------------------------------------------------------
module.exports = Parser;

