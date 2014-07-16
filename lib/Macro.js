// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var vm = require('vm');


// Macros ---------------------------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(name, handler) {
    this.name = name;
    this.handler = handler.toString();
}

Macro.defineMacros = function(context) {
    for(var name in Macro.Defined) {
        if (Macro.Defined.hasOwnProperty(name)) {
            vm.runInContext('var ' + name + ' = ' + Macro.Defined[name].handler, context, 'gbasm');
        }
    }
};


// Macro Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
Macro.Defined = {

    STRUPR: new Macro('STRUPR', function(str) {
        return str.toUpperCase();
    })

};


// Exports --------------------------------------------------------------------
module.exports = Macro;

