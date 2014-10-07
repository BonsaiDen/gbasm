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
var Macros = {

    // Constants --------------------------------------------------------------
    PI: Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,


    // String -----------------------------------------------------------------
    STRUPR: new Macro('STRUPR', function(str) {
        return str.toUpperCase();

    }, [new Macro.Argument('Text', 'string')]),

    STRLWR: new Macro('STRLWR', function(str) {
        return str.toLowerCase();

    }, [new Macro.Argument('Text', 'string')]),

    STRSUB: new Macro('STRSUB', function(str, from, length) {
        return str.substr(from, from + length);

    }, [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Index', 'number'),
        new Macro.Argument('Length', 'number')
    ]),

    STRIN: new Macro('STRIN', function(str, key) {
        return str.indexOf(key) !== -1 ? 1 : 0;

    }, [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Key', 'string')
    ]),

    STRPADR: new Macro('STRPADR', function(str, chr, len) {
        return str + new Array(len - str.length + 1).join(chr);

    }, [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Padding', 'string'),
        new Macro.Argument('Length', 'number')
    ]),

    STRPADL: new Macro('STRPADL', function(str, chr, len) {
        return new Array(len - str.length + 1).join(chr) + str;

    }, [
        new Macro.Argument('Text', 'string'),
        new Macro.Argument('Padding', 'string'),
        new Macro.Argument('Length', 'number')
    ]),


    // Math -------------------------------------------------------------------
    SIN: new Macro('SIN', function(value) {
        return Math.sin(value);

    }, [new Macro.Argument('radians', 'number')]),

    COS: new Macro('COS', function(value) {
        return Math.cos(value);

    }, [new Macro.Argument('radians', 'number')]),

    TAN: new Macro('TAN', function(value) {
        return Math.tan(value);

    }, [new Macro.Argument('radians', 'number')]),

    ASIN: new Macro('ASIN', function(value) {
        return Math.asin(value);

    }, [new Macro.Argument('radians', 'number')]),

    ACOS: new Macro('ACOS', function(value) {
        return Math.acos(value);

    }, [new Macro.Argument('radians', 'number')]),

    ATAN: new Macro('ATAN', function(value) {
        return Math.atan(value);

    }, [new Macro.Argument('radians', 'number')]),

    ATAN2: new Macro('ATAN2', function(y, x) {
        return Math.atan2(y, x);

    }, [
        new Macro.Argument('y', 'number'),
        new Macro.Argument('x', 'number')
    ]),

    LOG: new Macro('LOG', function(value) {
        return Math.log(value);

    }, [new Macro.Argument('number', 'number')]),

    EXP: new Macro('EXP', function(value) {
        return Math.exp(value);

    }, [new Macro.Argument('number', 'number')]),

    FLOOR: new Macro('FLOOR', function(value) {
        return Math.floor(value);

    }, [new Macro.Argument('number', 'number')]),

    CEIL: new Macro('CEIL', function(value) {
        return Math.ceil(value);

    }, [new Macro.Argument('number', 'number')]),

    ROUND: new Macro('ROUND', function(value) {
        return Math.round(value);

    }, [new Macro.Argument('number', 'number')]),

    SQRT: new Macro('SQRT', function(value) {
        return Math.sqrt(value);

    }, [new Macro.Argument('number', 'number')]),

    MAX: new Macro('MAX', function(a, b) {
        return Math.max(a, b);

    }, [
        new Macro.Argument('a', 'number'),
        new Macro.Argument('b', 'number')
    ]),

    MIN: new Macro('MIN', function(a, b) {
        return Math.min(a, b);

    }, [
        new Macro.Argument('a', 'number'),
        new Macro.Argument('b', 'number')
    ]),

    ABS: new Macro('ABS', function(value) {
        return Math.abs(value);

    }, [new Macro.Argument('Number', 'number')]),

    RAND: new Macro('RAND', function(from, to) {
        return from + Math.floor(Math.random() * (to - from));

    }, [
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

