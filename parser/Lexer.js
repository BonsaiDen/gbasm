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
    this.source = source;
    this.tokens = [];
    this.line = 0;
    this.col = 0;
    this.mode = TOKEN_NONE;
    this.expression = [];
    this.parenLevel = 0;
    this.parse(source);
}

Lexer.prototype = {

    getStream: function() {
        return new TokenStream(this.tokens, this.source);
    },

    parse: function(source) {

        var index = -1,
            length = source.length,
            line = 1,
            col = 0,
            skip = false,
            isNegative = false,
            delimiter = '',
            value = '',
            isNewline = false;

        while(index < length + 1) {

            index++;

            var raw = source[index] || '',
                c = raw.toLowerCase(),
                n = (source[index + 1] || '').toLowerCase();

            // Update line and col
            if (c === '\r' || c === '\n') {
                isNewline = true;
                this.line = line;
                this.col = col;
                line++;
                col = 0;

            } else {
                col++;
                isNewline = false;
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
                        if (!this.name(value, true)) {
                            this.error('invalid label name ' + value, null, line, col);
                        }

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
                        this.error(c, 'direction specifier (- or +) for @', this.line, this.col);
                    }
                    break;

            }

            // We matched a character for the current token
            if (skip || this.mode !== TOKEN_NONE) {
                continue;

            // Insert newline tokens with the correct line / col
            } else if (isNewline) {
                this.token('NEWLINE', c);
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
                    value = raw;

                // Check for the beginning of a operator
                } else if (isOperator(c)) {
                    this.mode = TOKEN_OPERATOR;
                    value = c;

                // Check for Parenthesis
                } else if (c === '(') {
                    this.token('LPAREN', c);

                } else if (c === ')') {
                    this.token('RPAREN', c);

                // Check for punctuation
                } else if (isPunctuation(c)) {
                    this.token('PUNCTUATION', c);

                // End of Input
                } else if (c === '') {
                    this.token('EOF', null);
                    break;

                } else {
                    this.error('character "' + c + '"', null, this.line, this.col);
                }

            }

        }

        console.log(this.tokens);
        return this.tokens;

    },

    expr: function(token, next) {

        if (isExpression(token, next)) {

            this.expression.push(token);

            switch(token.type) {
                case 'LPAREN':
                    this.parenLevel++;
                    break;

                case 'RPAREN':
                    this.parenLevel--;
                    break;
            }

        } else {

            switch(token.type) {
                case 'NUMBER':
                case 'NAME':
                    this.expression.push(token);
                    break;

                case 'OPERATOR':
                    this.expression.push(token);
                    break;

                case 'RPAREN':
                    this.expression.push(token);
                    this.parenLevel--;
                    if (this.parenLevel < 0) {
                        this.error('closing )', null, token.line, token.col);
                    }
                    break;

                default:
                    break;
            }

            if (this.expression.length) {

                if (this.parenLevel !== 0) {
                    this.error(next.type, 'closing )', next.line, next.col);

                // Parse the final expression
                } else if (this.expression.length > 1) {

                    // If we end with an operator the expression is invalid
                    if (this.expression[this.expression.length - 1].type === 'OPERATOR') {
                        this.error('unbound operator', 'expression value', token.line, token.col);

                    } else {

                        // Remove the expression tokens from the token stream
                        this.tokens.splice(this.tokens.length - this.expression.length, this.expression.length);

                        // Insert a expression token
                        this.tokens.push({
                            type: 'EXPRESSION',
                            value: this.expression.slice(),
                            line: this.expression[0].line,
                            col: this.expression[0].col
                        });

                    }

                // In case of a single token expression check if it is actually valid
                } else if (token.type !== 'NAME' && token.type !== 'NUMBER') {
                    this.error(token.type, 'expression', token.line, token.col);
                }

                this.expression.length = 0;

            }

        }

    },

    token: function(type, value) {

        // Combine offset labels directly here
        if (this.lastToken && this.lastToken.type === 'OFFSET') {

            // We require a number here
            if (type !== 'NUMBER') {
                this.error(type, 'a number after @' + this.lastToken.value, this.line, this.col);

            } else {
                this.lastToken.type = 'OFFSET_LABEL';
                this.lastToken.value = this.lastToken.value === '-' ? -value : value;
            }

        } else {

            var prev = this.lastToken;
            this.lastToken = {
                type: type,
                value: value,
                line: this.line,
                col: this.col
            };

            if (prev) {
                this.expr(prev, this.lastToken);
            }

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
                    return false;

                } else {
                    this.token('INSTRUCTION', value);
                }
                break;

            case 'DB':
            case 'DW':
            case 'DS':
            case 'EQU':
            case 'EQUS':
            case 'SECTION':
            case 'INCLUDE':
            case 'INCBIN':
                this.token('MACRO', value);
                break;

            default:
                this.token(isLabel ? 'LABEL_GLOBAL_DEF' : 'NAME', value);
                break;
        }

        return true;

    },

    error: error

};

module.exports = Lexer;


// Token Stream Interface -----------------------------------------------------
// ----------------------------------------------------------------------------
function TokenStream(tokens, source) {
    this.source = source;
    this.tokens = tokens;
    this.token = null;
    this.last = null;
    this.index = 0;
}

TokenStream.prototype = {

    error: error,

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

        if (!this.token || type === 'EOF') {
            this.error('end of input', type, this.last.line, this.last.col);

        } else if (this.is(type, this.token)) {
            return this.value(type, this.next());

        } else {
            this.error(this.value(this.token.type, this.token), type, this.last.line, this.last.col + 1);
        }

    },

    value: function(type, token) {

        switch(type) {
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

            case 'NEWLINE':
                return 'NEWLINE';

            default:
                return type;

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


// Helper ---------------------------------------------------------------------
function error(msg, expected, line, col) {

    var message = 'Unexpected ' + msg;
    message += ' at line ' + line + ', col ' + col;

    if (expected) {
        message += ', expected ' + expected + ' instead';
    }

    message += ':';

    var row = this.source.split(/[\n\r]/)[line - 1],
        pointer = new Array(col + 1).join(' ') + '^';

    console.log(message + '\n\n    ' + row + '\n    ' + pointer);

    throw new TypeError(message);

}

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
    return c !== '' && '+-*/><|&^~!%'.indexOf(c) !== -1;
}

function isExpression(token, next) {

    var valid = {

        'LPAREN': {
            'NAME': true,
            'NUMBER': true,
            'OPERATOR': true,
            'LPAREN': true,
            'RPAREN': true
        },

        'RPAREN': {
            'RPAREN': true,
            'OPERATOR': true
        },

        'OPERATOR': {
            'LPAREN': true,
            'NUMBER': true,
            'NAME': true
        },

        'NUMBER': {
            'RPAREN': true,
            'OPERATOR': true
        },

        'NAME': {
            'RPAREN': true,
            'OPERATOR': true
        }

    }[token.type];

    return valid ? (valid[next.type] || false) : false;

}

