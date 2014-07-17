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
    this.parse(file.buffer);
}

function LexerHandle(buffer) {
    this.index = 0;
    this.length = buffer.length;
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
    parse: function(buffer) {

        var handle = new LexerHandle(buffer);
        while(handle.index < handle.length) {

            var current = buffer[handle.index],
                next = -1;

            if (handle.index + 1 < handle.length) {
                next = buffer[handle.index + 1];
            }

            handle.index++;

            this.parseLineAndCol(handle, current);

            if (!(this.parseNextCharacter(handle, current, next) || this.mode !== TOKEN_NONE)) {

                // Insert newline tokens with the correct line / col
                if (handle.isNewline) {
                    this.token('NEWLINE', current);

                // We added a new token or we don't have one yet
                } else {
                    this.parseTokenStart(handle, current, next);
                }
            }

        }

        this.parseTokenStart(handle, -1, -1);

        return this.tokens;

    },

    parseLineAndCol: function(handle, c) {

        if (c === 10 || c === 13) {
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

    parseTokenStart: function(handle, current, next) {

        this.line = handle.line;
        this.col = handle.col;

        // Ignore whitespace
        if (isWhitespace(current)) {
            return;

        // Check for the beginning of a comment
        } else if (current === 59) {
            this.mode = TOKEN_COMMENT;
            handle.value = '';

        // Check for the beginning of a string
        } else if (current === 34 || current === 39) {
            this.mode = TOKEN_STRING;
            handle.delimiter = current;
            handle.value = '';

        // Check for the beginning of a decimal value
        } else if (isDecimal(current)) {
            this.mode = TOKEN_DECIMAL;
            handle.isNegative = false;
            handle.value = String.fromCharCode(current);

        // Check for the beginning of a hex value
        } else if (current === 36) {
            this.mode = TOKEN_HEX;
            handle.value = '';

        // Check for the beginning of a binary value
        } else if (current === 37 && isBinary(next)) {
            this.mode = TOKEN_BINARY;
            handle.value = '';

        // Check for the beginning of a negative decimal value
        } else if (current === 45 && isDecimal(next)) {
            this.mode = TOKEN_DECIMAL;
            handle.isNegative = true;
            handle.value = '-';

        // Check for the beginning of a relative label
        } else if (current === 64) {
            this.mode = TOKEN_OFFSET;
            handle.value = '';

        // Check for the beginning of a local label
        } else if (current === 46) {
            this.mode = TOKEN_LABEL;
            handle.value = '';

        // Check for the beginning of a name
        } else if (isNameStart(current)) {
            this.mode = TOKEN_NAME;
            handle.value = String.fromCharCode(current);

        // Check for the beginning of a operator
        } else if (isOperator(current)) {
            this.mode = TOKEN_OPERATOR;
            handle.value = String.fromCharCode(current);

        // Check for Parenthesis
        } else if (current === 40) {
            this.token('LPAREN', '(');

        } else if (current === 41) {
            this.token('RPAREN', ')');

        // Check for punctuation
        } else if (isPunctuation(current)) {
            this.token('PUNCTUATION', String.fromCharCode(current));

        // End of Input
        } else if (current === -1) {
            this.token('EOF', null);
            handle.index = handle.length + 255;

        } else {
            this.file.parseError('character "' + current + '"', null, handle.line, handle.col);
        }

    },

    parseNextCharacter: function(handle, current, next) {

        if (this.mode === TOKEN_DECIMAL) {
            if (isDecimal(current)) {
                handle.value += String.fromCharCode(current);

            } else if (current === 95) {
                return true; // Skip _ in decimal literals

            } else {
                this.token('NUMBER', parseInt(handle.value, 10));
            }

        } else if (this.mode === TOKEN_HEX) {
            if (isHex(current)) {
                handle.value += String.fromCharCode(current);

            } else if (current === 95) {
                return true; // Skip _ in hexy literals

            } else {
                this.token('NUMBER', parseInt(handle.value, 16));
            }

        } else if (this.mode === TOKEN_BINARY) {
            if (isBinary(current)) {
                handle.value += String.fromCharCode(current);

            } else if (current === 95) {
                return true; // Skip _ in binary literals

            } else {
                this.token('NUMBER', parseInt(handle.value, 2));
            }

        } else if (this.mode === TOKEN_STRING) {
            if (current === handle.delimiter) {
                this.token('STRING', handle.value);
                return true; // skip the ending " or '

            } else if (current === 92) {
                handle.index++;
                handle.value += String.fromCharCode(next);
                return true;

            } else {
                handle.value += String.fromCharCode(current);
            }

        } else if (this.mode === TOKEN_COMMENT) {
            if (current === 10 || current === 13) {
                this.token('COMMENT', handle.value);
                return true;

            } else {
                handle.value += String.fromCharCode(current);
            }

        } else if (this.mode === TOKEN_NAME) {

            if (isNamePart(current)) {
                handle.value += String.fromCharCode(current);

            } else if (current === 58) {
                if (!this.name(handle.value, true)) {
                    this.file.parseError('invalid label name ' + handle.value, null, handle.line, handle.col);
                }
                return true;

            } else {
                this.name(handle.value, false);
            }

        } else if (this.mode === TOKEN_LABEL) {
            if (isNamePart(current)) {
                handle.value += String.fromCharCode(current);

            } else if (current === 58) {
                this.token('LABEL_LOCAL_DEF', '.' + handle.value);
                return true;

            } else {
                this.token('LABEL_LOCAL_REF', '.' + handle.value);
            }

        } else if (this.mode === TOKEN_OPERATOR) {
            return this.parseOperator(handle, current);

        } else if (this.mode === TOKEN_OFFSET) {
            if (current === 45) {
                this.token('OFFSET_SIGN', '-');
                return true;

            } else if (current === 43) {
                this.token('OFFSET_SIGN', '+');
                return true;

            } else {
                this.file.parseError(current, 'direction specifier (- or +) for @', handle.line, handle.col);
            }

        }

        return false;

    },

    parseOperator: function(handle, current) {

        if (isOperator(current)) {
            handle.value += String.fromCharCode(current);

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
            case 'cp':
            case 'di':
            case 'ei':
            case 'jp':
            case 'jr':
            case 'or':
            case 'rl':
            case 'rr':
            case 'ld':
            case 'adc':
            case 'add':
            case 'and':
            case 'bit':
            case 'ccf':
            case 'cpl':
            case 'daa':
            case 'dec':
            case 'inc':
            case 'ldh':
            case 'nop':
            case 'pop':
            case 'res':
            case 'ret':
            case 'rla':
            case 'rlc':
            case 'rra':
            case 'rrc':
            case 'rst':
            case 'sbc':
            case 'scf':
            case 'set':
            case 'sla':
            case 'sra':
            case 'srl':
            case 'sub':
            case 'xor':
            case 'halt':
            case 'push':
            case 'call':
            case 'reti':
            case 'ldhl':
            case 'rlca':
            case 'rrca':
            case 'stop':
            case 'swap':
                return isLabel ? false : this.token('INSTRUCTION', value);

            case 'DB':
            case 'DW':
            case 'DS':
            case 'EQU':
            case 'EQUS':
            case 'BANK':
            case 'INCBIN':
            case 'SECTION':
            case 'INCLUDE':
                this.token('DIRECTIVE', value);
                return true;

            default:
                this.token(isLabel ? 'LABEL_GLOBAL_DEF' : 'NAME', value);
                return true;
        }

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
    // 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcedfghijklmnopqrstuvwxyz_'
    return c === 95 // _
        || (c >= 97 && c <= 122) // a-z
        || (c >= 65 && c <= 90);  // A-Z
}

function isNamePart(c) {
    // 'abcedfghijklmnopqrstuvwxyz_0123456789'
    return c === 95 // _
        || (c >= 97 && c <= 122) // a-z
        || (c >= 65 && c <= 90) // A-Z
        || (c >= 48 && c <= 57); // 0-9
}

function isWhitespace(c) {
    // space \n \r \t \v
    return c === 32 || c === 10 || c === 13 || c === 9 || c === 11;
}

function isDecimal(c) {
    // 0 - 9
    return c >= 48 && c <= 57;
}

function isHex(c) {
    return (c >= 48 && c <= 57)  // 0 - 0
        || (c >= 97 && c <= 102) // a - f
        || (c >= 65 && c <= 70); // A - F
}

function isBinary(c) {
    // 0 or 1
    return c === 48 || c === 49;
}

function isPunctuation(c) {
    // ( and ) and ,
    return c === 91 || c === 93 || c === 44;
}

function isOperator(c) {
    // '+-*/><|&^~!%'
    return c === 43 || c === 45 ||  c === 42 || c === 47 || c === 62
        || c === 60 || c === 124 || c === 38 || c === 94 || c === 126
        || c === 33 | c === 37;
}

function isExpression(token, next) {

    switch(token.type) {
        case 'LPAREN':
            switch(next.type) {
                case 'NAME':
                case 'LABEL_LOCAL_REF':
                case 'NUMBER':
                case 'STRING':
                case 'OPERATOR':
                case 'LPAREN':
                case 'RPAREN':
                    return true;

                default:
                    return false;
            }
            break;

        case 'RPAREN':
            switch(next.type) {
                case 'RPAREN':
                case 'OPERATOR':
                    return true;

                default:
                    return false;
            }
            break;

        case 'OPERATOR':
            switch(next.type) {
                case 'LPAREN':
                case 'NUMBER':
                case 'STRING':
                case 'LABEL_LOCAL_REF':
                case 'NAME':
                    return true;
                default:
                    return false;
            }
            break;

        case 'NUMBER':
            switch(next.type) {
                case 'RPAREN':
                case 'OPERATOR':
                    return true;

                default:
                    return false;
            }
            break;

        case 'STRING':
            switch(next.type) {
                case 'RPAREN':
                case 'OPERATOR':
                    return true;

                default:
                    return false;
            }
            break;

        case 'LABEL_LOCAL_REF':
            switch(next.type) {
                case 'RPAREN':
                case 'OPERATOR':
                    return true;

                default:
                    return false;
            }
            break;

        case 'NAME':
            switch(next.type) {
                case 'LPAREN':
                case 'RPAREN':
                case 'OPERATOR':
                    return true;

                default:
                    return false;
            }
            break;

        default:
            return false;

    }

}


// Exports --------------------------------------------------------------------
module.exports = Lexer;
module.exports.Token = Token;

