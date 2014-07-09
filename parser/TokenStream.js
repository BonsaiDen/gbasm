// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var tokenize = require('../lexer/gbz80');


// Token Stream Interface -----------------------------------------------------
// ----------------------------------------------------------------------------
function TokenStream(source) {
    this.token = null;
    this.last = null;
    this.tokens = tokenize(source);
    this.index = 0;
    this.preParse();
}

TokenStream.prototype = {

    preParse: function() {

        var i, token, next, secondNext;
        for(i = 0; i < this.tokens.length; i++) {

            token = this.tokens[i];
            next = this.tokens[i + 1];

            // Convert numbers
            if (token.id === 'DECIMAL') {
                token.value = parseInt(token.value, 10);
                token.id = 'NUMBER';

            } else if (token.id === 'BINARY') {
                token.value = parseInt(token.value, 2);
                token.id = 'NUMBER';

            } else if (token.id === 'HEX') {
                token.value = parseInt('0x' + token.value, 16);
                token.id = 'NUMBER';
            }

            // Parse Labels
            // . NAME :
            // . NAME
            // NAME :
            if (next && token.value === '.' && next.id === 'NAME') {

                // .someLabel:
                secondNext = this.tokens[i + 2];
                if (secondNext && secondNext.value === ':') {
                    token.id = 'LABEL';
                    token.isRelative = false;
                    token.isReference = false;
                    token.isLocal = true;
                    token.raw = null;
                    token.value = next.value;
                    this.tokens.splice(i, 3, token);
                    i -= 2;
                    continue;

                // .someLabel
                } else {
                    token.id = 'LABEL';
                    token.isRelative = false;
                    token.isReference = true;
                    token.isLocal = true;
                    token.raw = null;
                    token.value = next.value;
                    this.tokens.splice(i, 2, token);
                    i -= 1;
                    continue;
                }

            // someLabel:
            } else if (next && token.id === 'NAME' && next.value === ':') {
                token.id = 'LABEL';
                token.isRelative = false;
                token.isReference = false;
                token.isLocal = false;
                token.raw = null;
                token.value = token.value;
                this.tokens.splice(i, 2, token);
                i -= 1;
                continue;
            }

        }

        // Parse relative jump labels and group macro expressions
        var expression = [], e = 0, last;
        for(i = 0; i < this.tokens.length; i++) {

            token = this.tokens[i];
            next = this.tokens[i + 1];

            // Parse Relative Inline Labels
            if (token.value === '@') {

                // @+NUMBER
                // @-NUMBER
                if (next && (next.value === '-' || next.value === '+')) {

                    secondNext = this.tokens[i + 2];
                    if (secondNext && secondNext.id === 'NUMBER') {
                        token.id = 'LABEL';
                        token.isRelative = true;
                        token.isReference = false;
                        token.isLocal = false;
                        token.raw = null;
                        token.value = next.value === '-' ? -secondNext.value : secondNext.value;
                        this.tokens.splice(i, 3, token);
                        i -= 2;
                        continue;
                    }

                }

            }

            // Group Expressions
            if (next) {

                // Match the initial start of a expression
                if (token.id === 'OPERATOR' && this.isExpressionItem(token, next)) {
                    expression.push(token);
                    expression.push(next);
                    e = i + 2;

                } else if (this.isExpressionItem(null, token) && this.isExpressionItem(token, next)) {
                    expression.push(token);
                    expression.push(next);
                    e = i + 2;
                }

                // Match any subsequent expressions
                if (expression.length) {

                    last = next;

                    while(true) {
                        token = this.tokens[e];
                        if (this.isExpressionItem(last, token)) {
                            expression.push(token);
                            last = token;
                            e++;

                        } else {
                            break;
                        }
                    }

                    this.tokens.splice(i, expression.length, {
                        id: 'EXPRESSION',
                        value: expression,
                        raw: null,
                        from: expression[0].from,
                        to: last.to
                    });

                    expression = [];

                }
            }

        }

        // Now we check for macros, these are things in the form of NAME ( [arg,] )
        for(i = 0; i < this.tokens.length; i++) {

        }

    },

    isExpressionItem: function(prev, current) {

        if (current.id === 'LABEL' && current.isReference) {
            return !prev || prev.id === 'OPERATOR';

        } else if (current.id === 'NAME') {
            return !prev || prev.id === 'OPERATOR';

        } else if (current.id === 'NUMBER') {
            return !prev || prev.id === 'OPERATOR';

        } else if (current.id === 'OPERATOR') {
            return !prev || prev.id !== 'OPERATOR';
        }

    },

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
            throw new TypeError('Unexpected end of input at line ' + this.last.from.line + ', col ' + this.last.from.col + ' expected ' + type);

        } else if (this.is(type, this.token)) {
            return this.value(type, this.next());

        } else {
            throw new TypeError('Expected ' + type + ' at line ' + this.token.from.line + ', col ' + this.token.from.col + ' but instead got: ' + this.token.value);
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
                return token.id === 'NUMBER' && value >= 0 && value <= 255;

            case 'NUMBER_SIGNED_8BIT':
                return token.id === 'NUMBER' && value >= -127 && value <= 128;

            case 'NUMBER_BIT_INDEX':
                return token.id === 'NUMBER' && value >= 0 && value <= 7;

            case 'NUMBER_16BIT':
                // TODO resolve stuff later on...
                return token.id === 'LABEL' || token.id === 'EXPRESSION' || token.id === 'NAME' || token.id === 'NUMBER';

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


// Exports --------------------------------------------------------------------
module.exports = TokenStream;

