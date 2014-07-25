// Macro Logic Impelemations --------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(name, handler, args) {
    this.name = name;
    this.handler = handler;
    this.args = args;
}


// Macro Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
var Macros= {

    STRUPR: new Macro('STRUPR', function(str) {
        return str.toUpperCase();

    }, ['string'])

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

