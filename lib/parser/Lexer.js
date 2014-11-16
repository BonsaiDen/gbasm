// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var TokenStream = require('./TokenStream'),
    Errors = require('../Errors'),
    Expression = require('./Expression');


// Assembly Code Lexer --------------------------------------------------------
// ----------------------------------------------------------------------------
function Lexer(file) {
    this.file = file;
    this.tokens = [];
    this.lastToken = null;
    this.parenDepth = 0;
    this.expressionStack = [];
    this.inMacroArgs = false;
    this.inMacroBody = false;
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

            // Parse braces
            } else if (ch === 91) {
                this.token('[', '[', index);

            } else if (ch === 93) {
                this.token(']', ']', index);

            // Comma
            } else if (ch === 44) {
                this.token('COMMA', ',', index);

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
                index = this.parseOffsetOrMacroArg(buffer, index, buffer[index]);

            // Parse local labels
            } else if (ch === 46 && isNameStart(buffer[index])) {
                index = this.parseLocalLabel(buffer, index + 1, buffer[index]);

            } else {
                this.error('Unexpected character "' + String.fromCharCode(ch) + '" (' + ch + ')', null, index);
            }

        }

        this.token('EOF', '', index);

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

        } else if (ch === 38 && next === 38) {
            this.token('OPERATOR', '&&', index);
            return index + 1;

        } else if (ch === 124 && next === 124) {
            this.token('OPERATOR', '||', index);
            return index + 1;

        } else if (ch === 61 && next === 61) {
            this.token('OPERATOR', '==', index);
            return index + 1;

        } else if (ch === 33 && next === 61) {
            this.token('OPERATOR', '!=', index);
            return index + 1;

        } else if (ch === 62 && next === 61) {
            this.token('OPERATOR', '>=', index);
            return index + 1;

        } else if (ch === 60 && next === 61) {
            this.token('OPERATOR', '<=', index);
            return index + 1;

        } else if (ch === 42 && next=== 42) {
            this.token('OPERATOR', '**', at);
            return index + 1;

        // Single character operators
        } else if (ch === 60) {
            this.token('OPERATOR', '<', at);
            return index;

        } else if (ch === 62) {
            this.token('OPERATOR', '>', at);
            return index;

        } else if (ch === 33) {
            this.token('OPERATOR', '!', at);
            return index;

        } else if (ch === 43) {
            this.token('OPERATOR', '+', at);
            return index;

        } else if (ch === 45) {
            this.token('OPERATOR', '-', at);
            return index;

        } else if (ch === 42) {
            this.token('OPERATOR', '*', at);
            return index;

        } else if (ch === 47) {
            this.token('OPERATOR', '/', at);
            return index;

        } else if (ch === 37) {
            this.token('OPERATOR', '%', at);
            return index;

        } else if (ch === 38) {
            this.token('OPERATOR', '&', at);
            return index;

        } else if (ch === 124) {
            this.token('OPERATOR', '|', at);
            return index;

        } else if (ch === 126) {
            this.token('OPERATOR', '~', at);
            return index;

        } else if (ch === 94) {
            this.token('OPERATOR', '^', at);
            return index;

        } else {
            this.error('invalid operator "' + String.fromCharCode(ch) + '"', null, index);
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

    parseOffsetOrMacroArg: function(buffer, index, sign) {

        if (sign === 45) {
            this.token('OFFSET_SIGN', '-', index);
            return index + 1;

        } else if (sign === 43) {
            this.token('OFFSET_SIGN', '+', index);
            return index + 1;

        } else if (this.inMacroBody || this.inMacroArgs) {
            if (isNameStart(sign)) {
                return this.parseMacroArgName(buffer, index + 1, sign);

            } else {
                this.error(String.fromCharCode(sign), 'valid argument name instead', index + 1);
            }

        } else {
            // TODO also inform that the macro argument might not be inside a macro
            this.error(String.fromCharCode(sign), 'valid direction specifier (- or +) for offset', index + 1);
        }

    },

    parseHex: function(buffer, index, digit) {

        var number = '',
            at = index;

        while(isHex(digit)) {

            number += String.fromCharCode(digit);
            digit = buffer[++index];

            // Ignore interleaved underscore characters
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

            // Ignore interleaved underscore characters
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

            // Ignore interleaved underscore characters
            if (digit === 95) {
                digit = buffer[++index];
            }

        }

        // Floating point
        if (digit === 46) {

            number += String.fromCharCode(digit);
            digit = buffer[++index];

            while(isDecimal(digit)) {

                number += String.fromCharCode(digit);
                digit = buffer[++index];

                // Ignore interleaved underscore characters
                if (digit === 95) {
                    digit = buffer[++index];
                }

            }

            if (isNegative) {
                this.token('NUMBER', -parseFloat(number, 10), at - 1);

            } else {
                this.token('NUMBER', parseFloat(number, 10), at);
            }

        // Integer
        } else if (isNegative) {
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
            if (!this.name(name, true, at)) {
                this.error('invalid label name ' + name, null, at);

            } else {
                return index + 1;
            }

        } else {
            this.name(name, false, at);
            return index;
        }

    },

    parseMacroArgName: function(buffer, index, ch) {

        var name = String.fromCharCode(ch),
            at = index;

        ch = buffer[index];

        while(isNamePart(ch)) {
            name += String.fromCharCode(ch);
            ch = buffer[++index];
        }

        this.token('MACRO_ARG', name, at - 1);
        return index;

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
        while(index < buffer.length && isWhitespace(buffer[index])) {
            index++;
        }
        return index;
    },


    // Tokens -----------------------------------------------------------------
    token: function(type, value, index) {

        // Combine offset labels with their argument
        if (this.lastToken && this.lastToken.type === 'OFFSET_SIGN') {

            // We require a number here
            if (type !== 'NUMBER') {
                this.error(type, 'a number after @' + this.lastToken.value, index);

            } else {
                this.lastToken.type = 'OFFSET';
                this.lastToken.value = this.lastToken.value === '-' ? -value : value;
            }

        // Combine macro tokens with their name
        } else if (this.lastToken && this.lastToken.type === 'MACRO_DEF') {

            // We require a name here
            if (type !== 'NAME') {
                this.error(type, 'a valid name for a MACRO definiton', index);

            } else {
                this.lastToken.type = 'MACRO';
                this.lastToken.value = value;

                // Mark the parser as beging inside the macro arguments
                // This allows for MACRO_ARG tokens to be parsed
                this.inMacroArgs = true;
            }

        } else {
            var token = new Token(type, value, index, this.file);
            this.expr(this.lastToken, token);
            this.lastToken = token;
        }

    },

    expr: function(token, next) {

        // Collect expression tokens
        if (token && !this.inMacroArgs && isExpression(token.type, next.type, this.parenDepth)) {

            // We need to keep track of the paren depth
            // since we only consume COMMAs as part of a expression
            // when inside of parenthesis
            if (token.type === 'LPAREN') {
                this.parenDepth++;

            } else if (token.type === 'RPAREN') {
                this.parenDepth--;
            }

            this.expressionStack.push(token);

        // Wait for macro argument definitions to close
        } else if (this.inMacroArgs) {

            if (next.type === 'RPAREN') {
                this.inMacroArgs = false;
                this.inMacroBody = true;
            }

            this.tokens.push(next);

        // Parse the expression stack tokens
        } else {

            // If we have an expression stack...
            if (this.expressionStack.length > 0) {

                // ...push the last token onto it and parse the expression
                // into a binary tree
                this.expressionStack.push(token);

                // Replace the last token in the token list
                // with a expression token
                // We cannot modify the existing token in-place since it is
                // actually part of the binary expression tree
                this.tokens[this.tokens.length - 1] = new Token(
                    'EXPRESSION',
                    new Expression(this, this.expressionStack),
                    this.expressionStack[0].index,
                    this.file
                );

                this.expressionStack.length = 0;

            }

            // Reset the paren depth and push the next token (the one after the
            // expression) into the token list
            this.parenDepth = 0;
            this.tokens.push(next);

        }

    },

    name: function(value, isLabel, index) {

        if (isInstruction(value)) {
            this.token('INSTRUCTION', value, index);
            return false;

        } else if (isDirective(value)) {
            this.token('DIRECTIVE', value, index);
            return true;

        } else if (value === 'MACRO') {
            this.token('MACRO_DEF', value, index);
            return true;

        } else if (value === 'ENDMACRO') {

            if (!this.inMacroBody) {
                this.error(value + ' outside of MACRO definition', null, index);
            }

            this.inMacroBody = false;
            this.token('ENDMACRO', value, index);
            return true;

        } else {
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
function Token(type, value, index, file) {
    this.type = type;
    this.value = value;
    this.index = index;
    this.file = file;
}

Token.prototype = {

    clone: function() {
        return new Token(this.type, this.value, this.index, this.file);
    }

};

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
    return (c >= 48 && c <= 57)  // 0 - 9
        || (c >= 97 && c <= 102) // a - f
        || (c >= 65 && c <= 70); // A - F
}

function isBinary(c) {
    // 0 or 1
    return c === 48 || c === 49;
}

function isNewline(c) {
    return c === 13 || c === 10;
}

function isOperator(c) {
    // '+-*/><|&^~!%'
    return c === 43 || c === 45 ||  c === 42 || c === 47 || c === 62
        || c === 60 || c === 124 || c === 38 || c === 94 || c === 126
        || c === 33 || c === 37;
}

function isInstruction(value) {
    switch(value.length) {
        case 2:
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
                    return true;

                default:
                    return false;

            }
            break;

        case 3:
            switch(value) {
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
                    return true;

                default:
                    return false;

            }
            break;

        case 4:
            switch(value) {
                case 'halt':
                case 'push':
                case 'call':
                case 'reti':
                case 'ldhl':
                case 'rlca':
                case 'rrca':
                case 'stop':
                case 'swap':
                    return true;

                default:
                    return false;
            }
            break;

        default:
            return false;

    }
}


function isDirective(value) {
    return value === 'DB' || value === 'DW'
        || value === 'DS' || value === 'EQU'
        || value === 'EQUS' || value === 'BANK'
        || value === 'INCBIN' || value === 'SECTION'
        || value === 'INCLUDE';
}


function isExpression(token, next, parenDepth) {

    if (parenDepth === 0 && (token === 'COMMA' || next === 'COMMA') ) {
        return false;
    }

    switch(token) {
        case 'LPAREN':
            return checkParenExpressionLeft(next);

        case 'RPAREN':
            return checkParenExpressionRight(next);

        case 'OPERATOR':
            return checkOperatorExpression(next);

        case 'NUMBER':
        case 'STRING':
        case 'LABEL_LOCAL_REF':
            return checkValueExpression(next);

        case 'MACRO_ARG':
        case 'NAME':
            return checkNameExpression(next);

        case 'COMMA':
            return checkCommaExpression(next);

        default:
            return false;

    }

}

function checkParenExpressionLeft(next) {
    return next === 'NAME' || next === 'LABEL_LOCAL_REF' || next === 'NUMBER'
        || next === 'STRING' || next === 'OPERATOR' || next === 'LPAREN'
        || next === 'RPAREN' || next === 'MACRO_ARG';
}

function checkParenExpressionRight(next) {
    return next === 'RPAREN' || next === 'OPERATOR';
}

function checkOperatorExpression(next) {
    return next === 'LPAREN' || next === 'NUMBER' || next === 'STRING'
        || next === 'LABEL_LOCAL_REF' || next === 'NAME' || next === 'MACRO_ARG';
}

function checkValueExpression(next) {
    return next === 'RPAREN' || next === 'OPERATOR' || next === 'COMMA';
}

function checkNameExpression(next) {
    return next === 'LPAREN' || next === 'RPAREN' || next === 'OPERATOR'
        || next === 'COMMA';
}

function checkCommaExpression(next) {
    return next === 'LPAREN' || next === 'NAME' || next === 'STRING'
        || next === 'NUMBER' || next === 'MACRO_ARG';
}


// Exports --------------------------------------------------------------------
module.exports = Lexer;
module.exports.Token = Token;

