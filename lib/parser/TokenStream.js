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
        this.token = this.tokens[this.index];
        return this.last;
    },

    peak: function(type) {
        return this.token && this.is(type, this.token);
    },

    peakTwo: function(type) {
        return this.tokens[this.index + 1]
            && this.is(type, this.tokens[this.index + 1]);
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
            case 'OFFSET':
            case 'STRING':
            case 'NAME':
            case 'EXPRESSION':
                return token;

            case 'NUMBER':
                return token.value;

            case 'ZERO_PAGE_LOCATION':
                return token.value;

            case 'NEWLINE':
                return 'NEWLINE';

            default:
                return type;

        }

    },

    is: function(type, token) {

        var value = typeof token.value === 'string'
                    ? token.value.toLowerCase()
                    : token.value,

            tokenType = token.type;

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
                return tokenType === 'NUMBER' || tokenType === 'EXPRESSION'
                    || tokenType === 'NAME';

            case 'NUMBER_SIGNED_8BIT':
                return tokenType === 'NUMBER' || tokenType === 'EXPRESSION'
                    || tokenType === 'NAME';

            case 'NUMBER_BIT_INDEX':
                return tokenType === 'NUMBER' || tokenType === 'EXPRESSION'
                    || tokenType === 'NAME';

            case 'NUMBER_16BIT':
                return tokenType === 'LABEL'
                    || tokenType === 'LABEL_LOCAL_REF'
                    || tokenType === 'EXPRESSION'
                    || tokenType === 'NAME'
                    || tokenType === 'NUMBER';

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

            case 'DS':
                return tokenType === 'DIRECTIVE' && token.value === 'DS';

            case 'DB':
                return tokenType === 'DIRECTIVE' && token.value === 'DB';

            case 'DW':
                return tokenType === 'DIRECTIVE' && token.value === 'DW';

            case 'EQU':
                return tokenType === 'DIRECTIVE' && token.value === 'EQU';

            case 'EQUS':
                return tokenType === 'DIRECTIVE' && token.value === 'EQUS';

            case 'BANK':
                return tokenType === 'DIRECTIVE' && token.value === 'BANK';

            case 'EXPRESSION':
                return tokenType === 'EXPRESSION' || token.type === 'NAME';

            default:
                return type === tokenType;

        }

    },

    error: function(msg, type) {

        var index = this.token.index;
        if (this.token.type === 'NEWLINE') {
            index = this.last.index;
        }

        this.file.parseError(msg, type, index);

    }

};


// Exports --------------------------------------------------------------------
module.exports = TokenStream;

