// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var vm = require('vm');


// Macro Logic Impelemations --------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(name, handler) {
    this.name = name;
    this.handler = handler.toString();
}


// Macro Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
var Macros= {

    STRUPR: new Macro('STRUPR', function(str) {
        return str.toUpperCase();
    })

};


// Helpers --------------------------------------------------------------------
Macro.defineMacros = function(context) {
    for(var name in Macros) {
        if (Macros.hasOwnProperty(name)) {
            vm.runInContext(
                'var ' + name + ' = ' + Macros[name].handler,
                context,
                'gbasm'
            );
        }
    }
};

Macro.isDefined = function(name) {
    return Macros.hasOwnProperty(name);
};

Macro.get = function(name) {
    return Macros[name];
};


// Exports --------------------------------------------------------------------
module.exports = Macro;

