// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var TokenStream = require('./TokenStream'),
    Errors = require('../Errors');


// Assembly Code Lexer --------------------------------------------------------
// ----------------------------------------------------------------------------
function Lexer(file) {
    this.file = file;
    this.tokens = [];
    this.lastToken = null;
    this.expression = [];
    this.parenLevel = 0;
    this.parse(file.buffer);
    return new TokenStream(this.file, this.tokens);
}

Lexer.prototype = {

    // Parsing ----------------------------------------------------------------
    parse: function(buffer) {

        var index = 0;
        while(index < buffer.length) {

            var ch = buffer[index++];

            // Newlines
            if (isNewline(ch)) {
                this.token('NEWLINE', '', index - 1);

            // Skip Whitespace
            } else if (isWhitespace(ch)) {
                index = this.skipWhitespace(buffer, index);

            // Skip Comments
            } else if (ch === 59) {
                index = this.skipComment(buffer, index);

            // Parse Names
            } else if (isNameStart(ch)) {
                index = this.parseName(buffer, index, ch);

            // Parse Parenthesis
            } else if (ch === 40) {
                this.token('LPAREN', '(', index);

            } else if (ch === 41) {
                this.token('RPAREN', ')', index);

            // Check for punctuation
            } else if (isPunctuation(ch)) {
                this.token('PUNCTUATION', String.fromCharCode(ch), index);

            // Parse Decimal Numbers
            } else if (isDecimal(ch)) {
                index = this.parseDecimal(buffer, index, ch, false);

            // Parse Negative Decimal Numbers
            } else if (ch === 45 && isDecimal(buffer[index])) {
                index = this.parseDecimal(buffer, index + 1, buffer[index], true);

            // Parse Binary Numbers
            } else if (ch === 37 && isBinary(buffer[index])) {
                index = this.parseBinary(buffer, index, buffer[index]);

            // Parse Hexadecimal Numbers
            } else if (ch === 36 && isHex(buffer[index])) {
                index = this.parseHex(buffer, index, buffer[index]);

            // Parse Strings
            } else if (ch === 34 || ch === 39) {
                index = this.parseString(buffer, index, ch);

            // Parse Operators
            } else if (isOperator(ch)) {
                index = this.parseOperator(buffer, index, ch);

            // Parse offsets
            } else if (ch === 64) {
                index = this.parseOffset(buffer, index, buffer[index]);

            // Parse local labels
            } else if (ch === 46 && isNameStart(buffer[index])) {
                index = this.parseLocalLabel(buffer, index + 1, buffer[index]);

            } else {
                this.error('Unexpected character "' + ch + '" (' + ch.charCodeAt(0) + ')', null, index);
            }

        }

    },

    parseOperator: function(buffer, index, ch) {

        var next = buffer[index],
            at = index;

        // Double character operators
        if (ch === 62 && next === 62) {
            this.token('OPERATOR', '>>', index);
            return index + 1;

        } else if (ch === 60 && next === 60) {
            this.token('OPERATOR', '<<', index);
            return index + 1;

        } if (ch === 38 && next === 38) {
            this.token('OPERATOR', '&&', index);
            return index + 1;

        } if (ch === 124 && next === 124) {
            this.token('OPERATOR', '||', index);
            return index + 1;

        // Single character operators
        } else {
            this.token('OPERATOR', String.fromCharCode(ch), at);
            return index;
        }

    },

    parseLocalLabel: function(buffer, index, ch) {

        var name = '.' + String.fromCharCode(ch),
            at = index;

        ch = buffer[index];

        while(isNamePart(ch)) {
            name += String.fromCharCode(ch);
            ch = buffer[++index];
        }

        // Definition
        if (ch === 58) {
            this.token('LABEL_LOCAL_DEF', name, at - 1);
            return index + 1;

        // Reference
        } else {
            this.token('LABEL_LOCAL_REF', name, at - 1);
            return index;
        }

    },

    parseOffset: function(buffer, index, sign) {

        if (sign === 45) {
            this.token('OFFSET_SIGN', '-', index);

        } else if (sign === 43) {
            this.token('OFFSET_SIGN', '+', index);

        } else {
            this.error(String.fromCharCode(sign), 'valid direction specifier (- or +) for offset', index + 1);
        }

        return index + 1;

    },

    parseHex: function(buffer, index, digit) {

        var number = '',
            at = index;

        while(isHex(digit)) {

            number += String.fromCharCode(digit);
            digit = buffer[++index];

            // Ignore interleaved undersocres
            if (digit === 95) {
                digit = buffer[++index];
            }

        }

        this.token('NUMBER', parseInt(number, 16), at);

        return index;

    },

    parseBinary: function(buffer, index, digit) {

        var number = '',
            at = index;

        while(isBinary(digit)) {

            number += String.fromCharCode(digit);
            digit = buffer[++index];

            // Ignore interleaved undersocres
            if (digit === 95) {
                digit = buffer[++index];
            }

        }

        this.token('NUMBER', parseInt(number, 2), at);

        return index;

    },

    parseDecimal: function(buffer, index, digit, isNegative) {

        var number = String.fromCharCode(digit),
            at = index;

        digit = buffer[index];

        while(isDecimal(digit)) {

            number += String.fromCharCode(digit);
            digit = buffer[++index];

            // Ignore interleaved undersocres
            if (digit === 95) {
                digit = buffer[++index];
            }

        }

        if (isNegative) {
            this.token('NUMBER', -parseInt(number, 10), at - 1);

        } else {
            this.token('NUMBER', parseInt(number, 10), at);
        }

        return index;

    },

    parseName: function(buffer, index, ch) {

        var name = String.fromCharCode(ch),
            at = index;

        ch = buffer[index];

        while(isNamePart(ch)) {
            name += String.fromCharCode(ch);
            ch = buffer[++index];
        }

        // Label Definition
        if (ch === 58) {
            if (!this.name(name, true, index)) {
                this.error('invalid label name ' + name, null, at);

            } else {
                return index + 1;
            }

        } else {
            this.name(name, false, at);
            return index;
        }

    },

    parseString: function(buffer, index, delimiter) {

        var string = '',
            ch = buffer[index],
            at = index;

        while(ch !== delimiter) {

            // Escape sequences
            if (ch === 92) {
                ch = buffer[++index];
                switch(ch) {
                    case 34: // "
                        string += '"';
                        break;

                    case 39: // '
                        string += '\'';
                        break;

                    case 92: // \\
                        string += '\\';
                        break;

                    case 114: // CR
                        string += '\r';
                        break;

                    case 110: // LF
                        string += '\n';
                        break;

                    case 118: // VT
                        string += '\v';
                        break;

                    case 116: // HT
                        string += '\t';
                        break;

                    case 98: // BEL
                        string += '\b';
                        break;

                    case 48: // 0
                        string += '\0';
                        break;

                    default:
                        this.error('invalid escape sequence', null, index);
                        break;
                }


            } else {
                string += String.fromCharCode(ch);
            }

            ch = buffer[++index];

        }

        this.token('STRING', string, at);

        return index + 1;

    },

    skipComment: function(buffer, index) {
        while(!isNewline(buffer[index])) {
            index++;
        }
        return index;
    },

    skipWhitespace: function(buffer, index) {
        while(isWhitespace(buffer[index])) {
            index++;
        }
        return index;
    },


    // Tokens -----------------------------------------------------------------
    token: function(type, value, index) {

        // Combine offset labels directly here
        if (this.lastToken && this.lastToken.type === 'OFFSET_SIGN') {

            // We require a number here
            if (type !== 'NUMBER') {
                this.error(type, 'a number after @' + this.lastToken.value, index);

            } else {
                this.lastToken.type = 'OFFSET';
                this.lastToken.value = this.lastToken.value === '-' ? -value : value;
            }

        } else {

            var prev = this.lastToken;
            this.lastToken = new Token(type, value, index);

            if (prev) {
                this.expr(prev, this.lastToken);
            }

            this.tokens.push(this.lastToken);

        }

    },

    expr: function(token, next) {

        if (isExpression(token, next)) {

            if (token.type === 'LPAREN') {
                this.parenLevel++;

            } else if (token.type === 'RPAREN') {
                this.parenLevel--;
            }

            this.expression.push(token);

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
                        this.error('closing )', null, token.index);
                    }
                    break;

                default:
                    break;
            }

            if (this.expression.length) {

                if (this.parenLevel !== 0) {
                    this.error(next.type, 'closing )', next.index);

                // Parse the final expression
                } else if (this.expression.length > 1) {

                    // If we end with an operator the expression is invalid
                    if (this.expression[this.expression.length - 1].type === 'OPERATOR') {
                        this.error('unbound operator', 'expression value', token.index);

                    } else {

                        // Remove the expression tokens from the token stream
                        this.tokens.length = this.tokens.length - this.expression.length;

                        // Insert the expression token
                        this.tokens.push(new Token(
                            'EXPRESSION',
                            this.expression.slice(),
                            this.expression[0].index
                        ));

                    }

                // In case of a single token expression check if it is actually valid
                } else if (token.type !== 'NAME' && token.type !== 'NUMBER' && token.type !== 'LABEL_LOCAL_REF') {
                    this.error(token.type, 'expression', token.index);
                }

                this.expression.length = 0;

            }

        }

    },

    name: function(value, isLabel, index) {

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
                this.token('INSTRUCTION', value, index);
                return false;

            case 'DB':
            case 'DW':
            case 'DS':
            case 'EQU':
            case 'EQUS':
            case 'BANK':
            case 'INCBIN':
            case 'SECTION':
            case 'INCLUDE':
                this.token('DIRECTIVE', value, index);
                return true;

            default:
                this.token(isLabel ? 'LABEL_GLOBAL_DEF' : 'NAME', value, index);
                return true;
        }

    },


    // Error Handling ---------------------------------------------------------
    error: function(msg, expected, index) {
        new Errors.ParseError(this.file, msg, expected, index);
    }

};


// Helper ---------------------------------------------------------------------
function Token(type, value, index) {
    this.type = type;
    this.value = value;
    this.index = index;
    this.file = null;
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

function isNewline(c) {
    return c === 13 || c === 10;
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

