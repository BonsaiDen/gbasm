// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var TokenStream = require('./TokenStream');

// Token States
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


// Assembly Code Lexer --------------------------------------------------------
// ----------------------------------------------------------------------------
function Lexer(file) {
    this.file = file;
    this.tokens = [];
    this.line = 0;
    this.col = 0;
    this.mode = TOKEN_NONE;
    this.expression = [];
    this.parenLevel = 0;
    this.parse(file.source);
}

Lexer.prototype = {

    getStream: function() {
        return new TokenStream(this.file, this.tokens);
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
                            this.file.parseError('invalid label name ' + value, null, line, col);
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
                        this.token('OFFSET_SIGN', '-');

                    } else if (c === '+') {
                        skip = true;
                        this.token('OFFSET_SIGN', '+');

                    } else {
                        this.file.parseError(c, 'direction specifier (- or +) for @', this.line, this.col);
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
                    this.file.parseError('character "' + c + '"', null, this.line, this.col);
                }

            }

        }

        return this.tokens;

    },

    token: function(type, value) {

        // Combine offset labels directly here
        if (this.lastToken && this.lastToken.type === 'OFFSET_SIGN') {

            // We require a number here
            if (type !== 'NUMBER') {
                this.file.parseError(type, 'a number after @' + this.lastToken.value, this.line, this.col);

            } else {
                this.lastToken.type = 'OFFSET';
                this.lastToken.value = this.lastToken.value === '-' ? -value : value;
            }

        } else {

            var prev = this.lastToken;
            this.lastToken = new Token(type, value, this.line, this.col);

            if (prev) {
                this.expr(prev, this.lastToken);
            }

            this.tokens.push(this.lastToken);

        }

        this.mode = TOKEN_NONE;

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
                case 'LABEL_LOCAL_REF':
                    this.expression.push(token);
                    break;

                case 'OPERATOR':
                    this.expression.push(token);
                    break;

                case 'RPAREN':
                    this.expression.push(token);
                    this.parenLevel--;
                    if (this.parenLevel < 0) {
                        this.file.parseError('closing )', null, token.line, token.col);
                    }
                    break;

                default:
                    break;
            }

            if (this.expression.length) {

                if (this.parenLevel !== 0) {
                    this.file.parseError(next.type, 'closing )', next.line, next.col);

                // Parse the final expression
                } else if (this.expression.length > 1) {

                    // If we end with an operator the expression is invalid
                    if (this.expression[this.expression.length - 1].type === 'OPERATOR') {
                        this.file.parseError('unbound operator', 'expression value', token.line, token.col);

                    } else {

                        // Remove the expression tokens from the token stream
                        this.tokens.splice(this.tokens.length - this.expression.length, this.expression.length);

                        // Insert a expression token
                        this.tokens.push(new Token(
                            'EXPRESSION',
                            this.expression.slice(),
                            this.expression[0].line,
                            this.expression[0].col
                        ));

                    }

                // In case of a single token expression check if it is actually valid
                } else if (token.type !== 'NAME' && token.type !== 'NUMBER' && token.type !== 'LABEL_LOCAL_REF') {
                    this.file.parseError(token.type, 'expression', token.line, token.col);
                }

                this.expression.length = 0;

            }

        }

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

    }

};


// Helper ---------------------------------------------------------------------
function Token(type, value, line, col) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.col = col;
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
            'LABEL_LOCAL_REF': true,
            'NUMBER': true,
            'STRING': true,
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
            'STRING': true,
            'LABEL_LOCAL_REF': true,
            'NAME': true
        },

        'NUMBER': {
            'RPAREN': true,
            'OPERATOR': true
        },

        'STRING': {
            'RPAREN': true,
            'OPERATOR': true
        },

        'LABEL_LOCAL_REF': {
            'RPAREN': true,
            'OPERATOR': true
        },

        'NAME': {
            'LPAREN': true,
            'RPAREN': true,
            'OPERATOR': true
        }

    }[token.type];

    return valid ? (valid[next.type] || false) : false;

}


// Exports --------------------------------------------------------------------
module.exports = Lexer;
module.exports.Token = Token;

