// Macro Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(file, name, args, tokens, index) {

    this.file = file;
    this.name = name;
    this.args = args.map(function(arg) {
        return new Macro.Argument(arg.value, 'any');
    });

    // Tokens in this macro
    this.tokens = tokens;
    this.index = index;

    // Wether this macro can be called in an expression context or not
    // (i.e. it does return a value)
    this.isExpression = tokens.length === 1 && tokens[0].type === 'EXPRESSION';

    Macro.Map[name] = this;

}

Macro.Argument = function(name, type) {
    this.name = name;
    this.type = type;
};

Macro.RegisterArgument = function(name) {
    this.name = name;
};


// Statics --------------------------------------------------------------------
Macro.Map = {};

Macro.isDefined = function(name) {
    return Macro.Map.hasOwnProperty(name);
};

Macro.get = function(name) {
    return Macro.Map[name];
};


// Methods --------------------------------------------------------------------
Macro.prototype = {

    runAsExpression: function(args) {
        // TODO copy the expression and replace the arguments with their passed in values
        // then parse and link it
        return 0;
    },

    generateCode: function(sourceFile, args) {
        // TODO
    }

};


// Exports --------------------------------------------------------------------
module.exports = Macro;

