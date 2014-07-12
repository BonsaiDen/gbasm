// Token streaming interface for the Parser -----------------------------------
// ----------------------------------------------------------------------------
function TokenStream(file, tokens) {
    this.file = file;
    this.tokens = tokens;
    this.token = null;
    this.last = null;
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

        if (!this.token || type === 'EOF') {
            this.file.parseError('end of input', type, this.last.line, this.last.col);

        } else if (this.is(type, this.token)) {
            return this.value(type, this.next());

        } else {
            this.file.parseError(this.value(this.token.type, this.token), type, this.last.line, this.last.col + 1);
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

            case 'NUMBER':
                return token.value;

            case 'ZERO_PAGE_LOCATION':
                return token.value;

            case 'NEWLINE':
                return 'NEWLINE';

            case 'STRING':
            case 'NAME':
                return token;

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
                return token.type === 'NUMBER' || token.type === 'EXPRESSION' || token.type === 'NAME';

            case 'NUMBER_SIGNED_8BIT':
                return token.type === 'NUMBER' || token.type === 'EXPRESSION' || token.type === 'NAME';

            case 'NUMBER_BIT_INDEX':
                return token.type === 'NUMBER' || token.type === 'EXPRESSION' || token.type === 'NAME';

            case 'NUMBER_16BIT':
                return token.type === 'LABEL' || token.type === 'LABEL_LOCAL_REF'
                    || token.type === 'EXPRESSION' || token.type === 'NAME' || token.type === 'NUMBER'
                    || token.type === 'OFFSET';

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
                return token.type === 'MACRO' && token.value === 'DS';

            case 'DB':
                return token.type === 'MACRO' && token.value === 'DB';

            case 'DW':
                return token.type === 'MACRO' && token.value === 'DW';

            case 'EQU':
                return token.type === 'MACRO' && token.value === 'EQU';

            case 'EQUS':
                return token.type === 'MACRO' && token.value === 'EQUS';

            default:
                return type === token.type;
        }
    }

};


// Exports --------------------------------------------------------------------
module.exports = TokenStream;

