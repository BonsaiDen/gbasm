// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Errors = require('../Errors');


// Token streaming interface for the Parser -----------------------------------
// ----------------------------------------------------------------------------
function TokenStream(file, tokens) {
    this.file = file;
    this.tokens = tokens;
    this.token = this.tokens[0];
    this.last = null;
    this.index = 0;
}

TokenStream.prototype = {

    next: function() {
        this.index++;
        this.last = this.token;
        if (this.index < this.tokens.length) {
            this.token = this.tokens[this.index];
        }
        return this.last;
    },

    peak: function(type) {
        return this.token && this.is(type, this.token);
    },

    expect: function(type) {

        if (!this.token || type === 'EOF') {
            this.error('end of input', type);

        } else if (this.is(type, this.token)) {
            return this.value(type, this.next());

        } else {
            this.error(this.token.type, type);
        }

    },

    get: function(type) {

        if (!this.token || type === 'EOF') {
            this.error('end of input', type);

        } else if (this.is(type, this.token)) {
            return this.value(type, this.next());

        } else {
            this.error(this.token.type, type);
        }

    },

    value: function(type, token) {

        switch(type) {
            case 'ACCUMULATOR':
            case 'REGISTER_C':
            case 'REGISTER_HL':
            case 'REGISTER_HL_INCREMENT':
            case 'REGISTER_HL_DECREMENT':
            case 'REGISTER_SP':
            case 'REGISTER_8BIT':
            case 'REGISTER_DOUBLE':
            case 'REGISTER_STACKABLE':
            case 'FLAG':
                return token.value.toLowerCase();

            case 'NUMBER_8BIT':
            case 'NUMBER_SIGNED_8BIT':
            case 'NUMBER_BIT_INDEX':
            case 'NUMBER_16BIT':
            case 'OFFSET':
            case 'STRING':
            case 'NAME':
            case 'EXPRESSION':
            case 'MACRO_ARG':
                return token;

            case 'NUMBER':
            case 'ZERO_PAGE_LOCATION':
                return token.value;

            default:
                return type;

        }

    },

    is: function(type, token) {

        var tokenType = token.type;
        if (tokenType === 'DIRECTIVE') {
            return type === token.value;

        } else {
            return type === tokenType || isTokenOfType(type, tokenType) || isTokenOfValue(type, token.value);
        }

    },

    error: function(msg, type) {

        var index = this.token.index;
        if (this.token.type === 'NEWLINE') {
            index = this.last.index;
        }

        new Errors.ParseError(this.file, msg, type, index);

    }

};

// Helper ---------------------------------------------------------------------
function isTokenOfType(type, tokenType) {

    switch(type) {
        case 'NUMBER_8BIT':
        case 'NUMBER_SIGNED_8BIT':
        case 'NUMBER_BIT_INDEX':
            return tokenType === 'NUMBER' || tokenType === 'EXPRESSION'
                || tokenType === 'NAME';

        case 'NUMBER_16BIT':
            return tokenType === 'LABEL_LOCAL_REF'
                || tokenType === 'EXPRESSION'
                || tokenType === 'NAME'
                || tokenType === 'NUMBER';

        case 'EXPRESSION':
            return tokenType === 'EXPRESSION'
                || tokenType === 'NAME';

        default:
            return false;

    }

}

function isTokenOfValue(type, value) {

    value = typeof value === 'string' ? value.toLowerCase() : value;
    switch(type) {
        case 'ACCUMULATOR':
            return value === 'a';

        case 'REGISTER_C':
            return value === 'c';

        case 'REGISTER_HL':
            return value === 'hl';

        case 'REGISTER_HL_INCREMENT':
            return value === 'hli';

        case 'REGISTER_HL_DECREMENT':
            return value === 'hld';

        case 'REGISTER_8BIT':
            return value === 'a' || value === 'b' || value === 'c'
                || value === 'd' || value === 'e' || value === 'h'
                || value === 'l';

        case 'REGISTER_DOUBLE':
            return value === 'hl' || value === 'de' || value === 'bc';

        case 'REGISTER_STACKABLE':
            return value === 'hl' || value === 'de'
                || value === 'bc' || value === 'af';

        case 'REGISTER_SP':
            return value === 'sp';

        case 'FLAG':
            return value === 'c' || value === 'nc'
                || value === 'z' || value === 'nz';

        case 'ZERO_PAGE_LOCATION':
            return value === 0x00 || value === 0x08 || value === 0x10
                || value === 0x18 || value === 0x20 || value === 0x28
                || value === 0x30 || value === 0x38;

        default:
            return false;

    }

}


// Exports --------------------------------------------------------------------
module.exports = TokenStream;

