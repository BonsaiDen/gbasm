// Macro Logic Impelemations --------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(name, func, args) {
    this.name = name;
    this.func = func;
    this.args = args;
}

Macro.Argument = function(name, type) {
    this.name = name;
    this.type = type;
};


// Macro Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
const Macros = {

    // Constants --------------------------------------------------------------
    PI: Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,


    // String -----------------------------------------------------------------
    STRUPR: new Macro('STRUPR', ((str) => {
        return str.toUpperCase();

    }), [new Macro.Argument('Text', 'string')]),

    STRLWR: new Macro('STRLWR', ((str) => {
        return str.toLowerCase();

    }), [new Macro.Argument('Text', 'string')]),

    STRSUB: new Macro('STRSUB', ((str, from, length) => {
        return str.substr(from, from + length);

    }), [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Index', 'number'),
        new Macro.Argument('Length', 'number')
    ]),

    STRIN: new Macro('STRIN', ((str, key) => {
        return str.indexOf(key) !== -1 ? 1 : 0;

    }), [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Key', 'string')
    ]),

    STRPADR: new Macro('STRPADR', ((str, chr, len) => {
        return str + new Array(len - str.length + 1).join(chr);

    }), [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Padding', 'string'),
        new Macro.Argument('Length', 'number')
    ]),

    STRPADL: new Macro('STRPADL', ((str, chr, len) => {
        return new Array(len - str.length + 1).join(chr) + str;

    }), [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Padding', 'string'),
        new Macro.Argument('Length', 'number')
    ]),


    // Math -------------------------------------------------------------------
    SIN: new Macro('SIN', ((value) => {
        return Math.sin(value);

    }), [new Macro.Argument('radians', 'number')]),

    COS: new Macro('COS', ((value) => {
        return Math.cos(value);

    }), [new Macro.Argument('radians', 'number')]),

    TAN: new Macro('TAN', ((value) => {
        return Math.tan(value);

    }), [new Macro.Argument('radians', 'number')]),

    ASIN: new Macro('ASIN', ((value) => {
        return Math.asin(value);

    }), [new Macro.Argument('radians', 'number')]),

    ACOS: new Macro('ACOS', ((value) => {
        return Math.acos(value);

    }), [new Macro.Argument('radians', 'number')]),

    ATAN: new Macro('ATAN', ((value) => {
        return Math.atan(value);

    }), [new Macro.Argument('radians', 'number')]),

    ATAN2: new Macro('ATAN2', ((y, x) => {
        return Math.atan2(y, x);

    }), [
        new Macro.Argument('y', 'number'),
        new Macro.Argument('x', 'number')
    ]),

    LOG: new Macro('LOG', ((value) => {
        return Math.log(value);

    }), [new Macro.Argument('number', 'number')]),

    EXP: new Macro('EXP', ((value) => {
        return Math.exp(value);

    }), [new Macro.Argument('number', 'number')]),

    FLOOR: new Macro('FLOOR', ((value) => {
        return Math.floor(value);

    }), [new Macro.Argument('number', 'number')]),

    CEIL: new Macro('CEIL', ((value) => {
        return Math.ceil(value);

    }), [new Macro.Argument('number', 'number')]),

    ROUND: new Macro('ROUND', ((value) => {
        return Math.round(value);

    }), [new Macro.Argument('number', 'number')]),

    SQRT: new Macro('SQRT', ((value) => {
        return Math.sqrt(value);

    }), [new Macro.Argument('number', 'number')]),

    MAX: new Macro('MAX', ((a, b) => {
        return Math.max(a, b);

    }), [
        new Macro.Argument('a', 'number'),
        new Macro.Argument('b', 'number')
    ]),

    MIN: new Macro('MIN', ((a, b) => {
        return Math.min(a, b);

    }), [
        new Macro.Argument('a', 'number'),
        new Macro.Argument('b', 'number')
    ]),

    ABS: new Macro('ABS', ((value) => {
        return Math.abs(value);

    }), [new Macro.Argument('Number', 'number')]),

    RAND: new Macro('RAND', ((from, to) => {
        return from + Math.floor(Math.random() * (to - from));

    }), [
        new Macro.Argument('from', 'number'),
        new Macro.Argument('to', 'number')
    ])

};


// Helpers --------------------------------------------------------------------
Macro.isDefined = function(name) {
    return Macros.hasOwnProperty(name);
};

Macro.get = function(name) {
    return Macros[name];
};


// Exports --------------------------------------------------------------------
module.exports = Macro;

