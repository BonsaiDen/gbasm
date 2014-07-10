// Token States ---------------------------------------------------------------
var TOKEN_NONE = 0,
    TOKEN_DECIMAL = 1,
    TOKEN_HEX = 2,
    TOKEN_BINARY = 3,
    TOKEN_STRING = 4,
    TOKEN_COMMENT = 5,
    TOKEN_OPERATOR = 6,
    TOKEN_LABEL = 7,
    TOKEN_OFFSET = 8,
    TOKEN_NAME = 9;

function Lexer(source) {
    this.tokens = [];
    this.line = 0;
    this.col = 0;
    this.mode = TOKEN_NONE;
    this.parse(source);
}

Lexer.prototype = {

    getStream: function() {
        return new TokenStream(this.tokens);
    },

    parse: function(source) {

        var index = -1,
            length = source.length,
            line = 1,
            col = 0,
            skip = false,
            isNegative = false,
            delimiter = '',
            value = '';

        while(index < length + 1) {

            index++;

            var raw = source[index] || '',
                c = raw.toLowerCase(),
                n = (source[index + 1] || '').toLowerCase();

            // Update line and col
            if (c === '\r' || c === '\n') {
                line++;
                col = 0;

            } else {
                col++;
            }

            // check for continations
            skip = false;
            switch(this.mode) {
                case TOKEN_DECIMAL:
                    if (isDecimal(c)) {
                        value += raw;

                    } else if (c === '_') {
                        skip = true;

                    } else {
                        this.token('NUMBER', parseInt(value, 10));
                    }
                    break;

                case TOKEN_HEX:
                    if (isHex(c)) {
                        value += raw;

                    } else if (c === '_') {
                        skip = true;

                    } else {
                        this.token('NUMBER', parseInt(value, 16));
                    }
                    break;

                case TOKEN_BINARY:
                    if (isBinary(c)) {
                        value += raw;

                    } else if (c === '_') {
                        skip = true;

                    } else {
                        this.token('NUMBER', parseInt(value, 2));
                    }
                    break;

                case TOKEN_STRING:
                    if (c === delimiter) {
                        skip = true; // skip the ending " or '
                        this.token('STRING', value);

                    } else if (c === '\\') {
                        index++;
                        value += source[index] || '';
                        skip = true;

                    } else {
                        value += raw;
                    }
                    break;

                case TOKEN_COMMENT:
                    if (c === '\n' || c === '\r' || c === '') {
                        skip = true; // skip the whitespace
                        this.token('COMMENT', value);

                    } else {
                        value += raw;
                    }
                    break;

                case TOKEN_NAME:
                    if (isName(c)) {
                        value += raw;

                    } else if (c === ':') {
                        skip = true;
                        this.name(value, true);

                    } else {
                        this.name(value, false);
                    }
                    break;

                case TOKEN_LABEL:
                    if (isName(c)) {
                        value += raw;

                    } else if (c === ':') {
                        skip = true; // skip the colon
                        this.token('LABEL_LOCAL_DEF', value);

                    } else {
                        this.token('LABEL_LOCAL_REF', value);
                    }
                    break;

                case TOKEN_OPERATOR:
                    if (isOperator(c)) {

                        value += raw;

                        if (value.length === 2) {
                            switch(value) {
                                case '>>':
                                case '<<':
                                case '&&':
                                case '||':
                                    skip = true; // skip the second character
                                    this.token('OPERATOR', value);
                                    break;

                                default:
                                    // Split into one token and one additional character
                                    this.token('OPERATOR', value[0]);
                                    value = value.substring(1);
                                    break;
                            }

                        }

                    } else {
                        this.token('OPERATOR', value);
                    }
                    break;

                case TOKEN_OFFSET:
                    if (c === '-') {
                        skip = true;
                        this.token('OFFSET', '-');

                    } else if (c === '+') {
                        skip = true;
                        this.token('OFFSET', '+');

                    } else {
                        throw new TypeError('Expected direction specifier for relative label.');
                    }
                    break;

            }

            // We matched a character for the current token
            if (skip || this.mode !== TOKEN_NONE) {
                continue;

            // We added a new token or we don't have one yet
            } else {

                this.line = line;
                this.col = col;

                // Ignore whitespace
                if (isWhitespace(c)) {
                    continue;

                // Check for the beginning of a comment
                } else if (c === ';') {
                    this.mode = TOKEN_COMMENT;
                    value = '';

                // Check for the beginning of a string
                } else if (c === '"' || c === '\'') {
                    this.mode = TOKEN_STRING;
                    delimiter = c;
                    value = '';

                // Check for the beginning of a decimal value
                } else if (isDecimal(c)) {
                    this.mode = TOKEN_DECIMAL;
                    isNegative = false;
                    value = c;

                // Check for the beginning of a hex value
                } else if (c === '$') {
                    this.mode = TOKEN_HEX;
                    value = '';

                // Check for the beginning of a binary value
                } else if (c === '%' && isBinary(n)) {
                    this.mode = TOKEN_BINARY;
                    value = '';

                // Check for the beginning of a negative decimal value
                } else if (c === '-' && isDecimal(n)) {
                    this.mode = TOKEN_DECIMAL;
                    isNegative = true;
                    value = '-';

                // Check for the beginning of a relative label
                } else if (c === '@') {
                    this.mode = TOKEN_OFFSET;
                    value = '';

                // Check for the beginning of a local label
                } else if (c === '.') {
                    this.mode = TOKEN_LABEL;
                    value = '';

                // Check for the beginning of a name
                } else if (isNameStart(c)) {
                    this.mode = TOKEN_NAME;
                    value = c;

                // Check for the beginning of a operator
                } else if (isOperator(c)) {
                    this.mode = TOKEN_OPERATOR;
                    value = c;

                // Check for punctuation
                } else if (isPunctuation(c)) {
                    this.token('PUNCTUATION', c);

                // End of Input
                } else if (c === '') {
                    this.token('EOF', null);
                    break;

                } else {
                    throw new TypeError('Unexpected character: ' + c);
                }

            }

        }

        return this.tokens;

    },

    token: function(type, value) {

        // Combine offset labels directly here
        if (this.lastToken && this.lastToken.type === 'OFFSET') {

            // We require a number here
            if (type !== 'NUMBER') {
                throw new TypeError('Expected NUMBER after @' + this.lastToken.value);

            } else {
                this.lastToken.type = 'OFFSET_LABEL';
                this.lastToken.value = this.lastToken.value === '-' ? -value : value;
            }

        } else {

            this.lastToken = {
                type: type,
                value: value,
                line: this.line,
                col: this.col
            };

            this.tokens.push(this.lastToken);

        }

        this.mode = TOKEN_NONE;

    },

    name: function(value, isLabel) {

        switch(value) {
            case 'adc':
            case 'add':
            case 'and':
            case 'bit':
            case 'call':
            case 'ccf':
            case 'cp':
            case 'cpl':
            case 'daa':
            case 'dec':
            case 'di':
            case 'ei':
            case 'halt':
            case 'inc':
            case 'jp':
            case 'jr':
            case 'ld':
            case 'ldh':
            case 'ldhl':
            case 'nop':
            case 'or':
            case 'pop':
            case 'push':
            case 'res':
            case 'ret':
            case 'reti':
            case 'rl':
            case 'rla':
            case 'rlc':
            case 'rlca':
            case 'rr':
            case 'rra':
            case 'rrc':
            case 'rrca':
            case 'rst':
            case 'sbc':
            case 'scf':
            case 'set':
            case 'sla':
            case 'sra':
            case 'srl':
            case 'stop':
            case 'sub':
            case 'swap':
            case 'xor':
                if (isLabel) {
                    throw new TypeError('Invalid label name: ' + value);

                } else {
                    this.token('INSTRUCTION', value);
                }
                break;

            default:
                this.token(isLabel ? 'LABEL_GLOBAL_DEF' : 'NAME', value);
                break;
        }

    }

};

module.exports = Lexer;


// Helper ---------------------------------------------------------------------
function isNameStart(c) {
    return c !== '' && 'abcedfghijklmnopqrstuvwxyz_'.indexOf(c) !== -1;
}

function isName(c) {
    return c !== '' && 'abcedfghijklmnopqrstuvwxyz_0123456789'.indexOf(c) !== -1;
}

function isWhitespace(c) {
    return c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\v';
}

function isDigit(c) {
    return c === '0' || c === '1' || c === '2' || c === '3'
        || c === '4' || c === '5' || c === '6' || c === '7'
        || c === '8' || c === '9';
}

function isDecimal(c) {
    return isDigit(c);
}

function isHex(c) {
    return isDigit(c) || c === 'a' || c === 'b' || c === 'c'
        || c === 'd' || c === 'e' || c === 'f';
}

function isBinary(c) {
    return c === '0' || c === '1';
}

function isPunctuation(c) {
    return c === '[' || c === ']' || c === ',';
}

function isOperator(c) {
    return c !== '' && '+-*/><|&^~!%()'.indexOf(c) !== -1;
}



// Token Stream Interface -----------------------------------------------------
// ----------------------------------------------------------------------------
function TokenStream(tokens) {
    this.token = null;
    this.last = null;
    this.tokens = tokens;
    this.index = 0;
}

TokenStream.prototype = {

    next: function() {
        this.index++;
        this.last = this.token;
        this.token = this.tokens[this.index];
        return this.tokens[this.index - 1] || null;
    },

    peak: function(type) {
        return this.token && this.is(type, this.token);
    },

    peakTwo: function(type) {
        return this.tokens[this.index + 1] && this.is(type, this.tokens[this.index + 1]);
    },

    expect: function(type) {

        if (!this.token) {
            throw new TypeError('Unexpected end of input at line ' + this.last.line + ', col ' + this.last.col + ' expected ' + type);

        } else if (this.is(type, this.token)) {
            return this.value(type, this.next());

        } else {
            throw new TypeError('Expected ' + type + ' at line ' + this.token.line + ', col ' + this.token.col + ' but instead got: ' + this.token.value);
        }

    },

    value: function(type, token) {

        switch(type) {
            // TODO remove all of these!
            case 'ACCUMULATOR':
                return 'a';

            case 'REGISTER_C':
                return 'c';

            case 'REGISTER_HL':
                return 'hl';

            case 'REGISTER_HL_INCREMENT':
                return 'hli';

            case 'REGISTER_HL_DECREMENT':
                return 'hld';

            case 'REGISTER_SP':
                return 'sp';

            case 'REGISTER_8BIT':
            case 'REGISTER_DOUBLE':
            case 'REGISTER_STACKABLE':
            case 'FLAG':
                return token.value.toLowerCase();

            case 'NUMBER_8BIT':
            case 'NUMBER_SIGNED_8BIT':
            case 'NUMBER_BIT_INDEX':
            case 'NUMBER_16BIT':
                return token;

            case 'ZERO_PAGE_LOCATION':
                return token.value;

            default:
                return null;

        }

    },

    is: function(type, token) {

        var value = typeof token.value === 'string' ? token.value.toLowerCase() : token.value;

        switch(type) {
            case 'ACCUMULATOR':
                return value === 'a';

            case 'REGISTER_HL':
                return value === 'hl';

            case 'REGISTER_C':
                return value === 'c';

            case 'REGISTER_HL_INCREMENT':
                return value === 'hli';

            case 'REGISTER_HL_DECREMENT':
                return value === 'hld';

            case 'REGISTER_8BIT':
                return value === 'a' || value === 'b'
                    || value === 'c' || value === 'd'
                    || value === 'e' || value === 'h'
                    || value === 'l';

            case 'REGISTER_DOUBLE':
                return value === 'hl' || value === 'de' || value === 'bc';

            case 'REGISTER_STACKABLE':
                return value === 'hl' || value === 'de'
                    || value === 'bc' || value === 'af';

            case 'REGISTER_SP':
                return value === 'sp';

            case 'NUMBER_8BIT':
                // TODO pre-convert number values
                return token.type === 'NUMBER' && value >= 0 && value <= 255;

            case 'NUMBER_SIGNED_8BIT':
                return token.type === 'NUMBER' && value >= -127 && value <= 128;

            case 'NUMBER_BIT_INDEX':
                return token.type === 'NUMBER' && value >= 0 && value <= 7;

            case 'NUMBER_16BIT':
                // TODO resolve stuff later on...
                return token.type === 'LABEL' || token.type === 'EXPRESSION' || token.type === 'NAME' || token.type === 'NUMBER';

            case 'FLAG':
                return value === 'c' || value === 'nc'
                    || value === 'z' || value === 'nz';

            case 'ZERO_PAGE_LOCATION':
                return value === 0x00 || value === 0x08 || value === 0x10
                    || value === 0x18 || value === 0x20 || value === 0x28
                    || value === 0x30 || value === 0x38;

            case ',':
                return value === ',';

            case '[':
                return value === '[';

            case ']':
                return value === ']';

            case '@':
                return value === '@';

            default:
                break;
        }
    }

};

