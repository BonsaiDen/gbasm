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

function LexerHandle(source) {
    this.index = 0;
    this.length = source.length;
    this.line = 1;
    this.col = 0;
    this.isNegative = false;
    this.delimiter = '';
    this.value = '';
    this.isNewline = false;
}

Lexer.prototype = {

    getStream: function() {
        return new TokenStream(this.file, this.tokens);
    },

    // Parsing ----------------------------------------------------------------
    parse: function(source) {

        var handle = new LexerHandle(source);
        while(handle.index < handle.length + 1) {

            var raw = source[handle.index] || '',
                current = raw.toLowerCase(),
                next = (source[++handle.index] || '').toLowerCase();

            this.parseLineAndCol(handle, current);

            if (!(this.parseNextCharacter(handle, raw, current, next) || this.mode !== TOKEN_NONE)) {

                // Insert newline tokens with the correct line / col
                if (handle.isNewline) {
                    this.token('NEWLINE', current);

                // We added a new token or we don't have one yet
                } else {
                    this.parseTokenStart(handle, raw, current, next);
                }
            }

        }

        return this.tokens;

    },

    parseLineAndCol: function(handle, c) {

        if (c === '\r' || c === '\n') {
            handle.isNewline = true;
            this.line = handle.line;
            this.col = handle.col;
            handle.line++;
            handle.col = 0;

        } else {
            handle.col++;
            handle.isNewline = false;
        }

    },

    parseTokenStart: function(handle, raw, current, next) {

        this.line = handle.line;
        this.col = handle.col;

        // Ignore whitespace
        if (isWhitespace(current)) {
            return;

        // Check for the beginning of a comment
        } else if (current === ';') {
            this.mode = TOKEN_COMMENT;
            handle.value = '';

        // Check for the beginning of a string
        } else if (current === '"' || current === '\'') {
            this.mode = TOKEN_STRING;
            handle.delimiter = current;
            handle.value = '';

        // Check for the beginning of a decimal value
        } else if (isDecimal(current)) {
            this.mode = TOKEN_DECIMAL;
            handle.isNegative = false;
            handle.value = current;

        // Check for the beginning of a hex value
        } else if (current === '$') {
            this.mode = TOKEN_HEX;
            handle.value = '';

        // Check for the beginning of a binary value
        } else if (current === '%' && isBinary(next)) {
            this.mode = TOKEN_BINARY;
            handle.value = '';

        // Check for the beginning of a negative decimal value
        } else if (current === '-' && isDecimal(next)) {
            this.mode = TOKEN_DECIMAL;
            handle.isNegative = true;
            handle.value = '-';

        // Check for the beginning of a relative label
        } else if (current === '@') {
            this.mode = TOKEN_OFFSET;
            handle.value = '';

        // Check for the beginning of a local label
        } else if (current === '.') {
            this.mode = TOKEN_LABEL;
            handle.value = '';

        // Check for the beginning of a name
        } else if (isNameStart(current)) {
            this.mode = TOKEN_NAME;
            handle.value = raw;

        // Check for the beginning of a operator
        } else if (isOperator(current)) {
            this.mode = TOKEN_OPERATOR;
            handle.value = current;

        // Check for Parenthesis
        } else if (current === '(') {
            this.token('LPAREN', current);

        } else if (current === ')') {
            this.token('RPAREN', current);

        // Check for punctuation
        } else if (isPunctuation(current)) {
            this.token('PUNCTUATION', current);

        // End of Input
        } else if (current === '') {
            this.token('EOF', null);
            handle.index = handle.length + 255;

        } else {
            this.file.parseError('character "' + current + '"', null, handle.line, handle.col);
        }

    },

    parseNextCharacter: function(handle, raw, current, next) {

        if (this.mode === TOKEN_DECIMAL) {
            if (isDecimal(current)) {
                handle.value += raw;

            } else if (current === '_') {
                return true;

            } else {
                this.token('NUMBER', parseInt(handle.value, 10));
            }

        } else if (this.mode === TOKEN_HEX) {
            if (isHex(current)) {
                handle.value += raw;

            } else if (current === '_') {
                return true;

            } else {
                this.token('NUMBER', parseInt(handle.value, 16));
            }

        } else if (this.mode === TOKEN_BINARY) {
            if (isBinary(current)) {
                handle.value += raw;

            } else if (current === '_') {
                return true;

            } else {
                this.token('NUMBER', parseInt(handle.value, 2));
            }

        } else if (this.mode === TOKEN_STRING) {
            if (current === handle.delimiter) {
                this.token('STRING', handle.value);
                return true; // skip the ending " or '

            } else if (current === '\\') {
                handle.index++;
                handle.value += next || '';
                return true;

            } else {
                handle.value += raw;
            }

        } else if (this.mode === TOKEN_COMMENT) {
            if (current === '\n' || current === '\r' || current === '') {
                this.token('COMMENT', handle.value);
                return true;

            } else {
                handle.value += raw;
            }

        } else if (this.mode === TOKEN_NAME) {

            if (isName(current)) {
                handle.value += raw;

            } else if (current === ':') {
                if (!this.name(handle.value, true)) {
                    this.file.parseError('invalid label name ' + handle.value, null, handle.line, handle.col);
                }
                return true;

            } else {
                this.name(handle.value, false);
            }

        } else if (this.mode === TOKEN_LABEL) {
            if (isName(current)) {
                handle.value += raw;

            } else if (current === ':') {
                this.token('LABEL_LOCAL_DEF', handle.value);
                return true;

            } else {
                this.token('LABEL_LOCAL_REF', handle.value);
            }

        } else if (this.mode === TOKEN_OPERATOR) {
            return this.parseOperator(handle, raw, current, next);

        } else if (this.mode === TOKEN_OFFSET) {
            if (current === '-') {
                this.token('OFFSET_SIGN', '-');
                return true;

            } else if (current === '+') {
                this.token('OFFSET_SIGN', '+');
                return true;

            } else {
                this.file.parseError(current, 'direction specifier (- or +) for @', handle.line, handle.col);
            }

        }

        return false;

    },

    parseOperator: function(handle, raw, current, next) {

        if (isOperator(current)) {
            handle.value += raw;

            if (handle.value.length === 2) {

                if (handle.value === '>>' || handle.value === '<<' || handle.value === '&&' || handle.value === '||') {
                    this.token('OPERATOR', handle.value);
                    return true;

                // Split into one token and one additional character
                } else {
                    this.token('OPERATOR', handle.value[0]);
                    handle.value = handle.value.substring(1);
                    return false;
                }

            }

        } else {
            this.token('OPERATOR', handle.value);
        }

    },


    // Tokens -----------------------------------------------------------------
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
            case 'BANK':
                this.token('DIRECTIVE', value);
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

