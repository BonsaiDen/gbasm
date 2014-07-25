// Macro Logic Impelemations --------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(name, handler, args) {
    this.name = name;
    this.handler = handler;
    this.args = args;
}


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

    }, ['string']),

    STRLWR: new Macro('STRLWR', function(str) {
        return str.toLowerCase();

    }, ['string']),

    STRSUB: new Macro('STRSUB', function(str, from, length) {
        return str.substr(from, from + length);

    }, ['string', 'number', 'numbre']),

    STRIN: new Macro('STRIN', function(str, key) {
        return str.indexOf(key) !== -1 ? 1 : 0;

    }, ['string', 'string']),


    // Math -------------------------------------------------------------------
    SIN: new Macro('SIN', function(value) {
        return Math.sin(value);

    }, ['number']),

    COS: new Macro('COS', function(value) {
        return Math.cos(value);

    }, ['number']),

    TAN: new Macro('TAN', function(value) {
        return Math.tan(value);

    }, ['number']),

    ASIN: new Macro('ASIN', function(value) {
        return Math.asin(value);

    }, ['number']),

    ACOS: new Macro('ACOS', function(value) {
        return Math.acos(value);

    }, ['number']),

    ATAN: new Macro('ATAN', function(value) {
        return Math.atan(value);

    }, ['number']),

    ATAN2: new Macro('ATAN2', function(y, x) {
        return Math.atan2(y, x);

    }, ['number', 'number']),

    LOG: new Macro('LOG', function(value) {
        return Math.log(value);

    }, ['number']),

    EXP: new Macro('EXP', function(value) {
        return Math.exp(value);

    }, ['number']),

    FLOOR: new Macro('FLOOR', function(value) {
        return Math.floor(value);

    }, ['number']),

    CEIL: new Macro('CEIL', function(value) {
        return Math.ceil(value);

    }, ['number']),

    ROUND: new Macro('ROUND', function(value) {
        return Math.round(value);

    }, ['number']),

    SQRT: new Macro('SQRT', function(value) {
        return Math.sqrt(value);

    }, ['number']),

    MAX: new Macro('MAX', function(value) {
        return Math.max(value);

    }, ['number']),

    MIN: new Macro('MIN', function(value) {
        return Math.min(value);

    }, ['number']),

    ABS: new Macro('ABS', function(value) {
        return Math.abs(value);

    }, ['number'])

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

