// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Errors = require('../Errors'),
    Expression = require('../parser/Expression'),
    Parser = require('../parser/Parser'),
    TokenStream = require('../parser/TokenStream');


// Macro Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(file, name, args, tokens, index) {

    this.file = file;
    this.name = name;

    var argMap = {};
    this.args = args.map(function(arg) {

        var name = arg.value;
        if (argMap.hasOwnProperty(name)) {
            new Errors.DeclarationError(
                file,
                'macro argument @' + name,
                arg.index,
                argMap[name]
            );

        } else {
            argMap[name] = arg;
            return new Macro.Argument(name, 'any');
        }
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

    getExpressionForArguments: function(args) {
        return expressionWithArguments(
            this.file,
            this.tokens[0].value,
            getArgumentMap(this.args, args),
            false
        );
    },

    expand: function(sourceFile, args) {

        var that = this,
            argumentMap = getArgumentMap(this.args, args);

        var tokens = this.tokens.map(function(original) {

            // Clone all tokens
            var token = original.clone();

            // Clone expressions
            if (token.value instanceof Expression.Node) {
                token.value = expressionWithArguments(
                    that.file,
                    token.value,
                    argumentMap,
                    true
                );

            } else if (token.type === 'MACRO_ARG') {
                replaceTokenWithArgument(that.file, token, argumentMap, true);
            }

            return token;

        });

        var stream = new TokenStream(sourceFile, tokens),
            parser = new Parser(sourceFile, stream);

        // TODO create a file proxy with a given target section
        // to that we can splice stuff into the entry list of the section with
        // the specified index offset

        // TODO parse the new code and splice it into the existing file's data

    }

};


// Helpers --------------------------------------------------------------------
function getArgumentMap(expected, provided) {

    var map = {};
    expected.forEach(function(arg, index) {
        map[arg.name] = provided[index];
    });

    return map;

}

function expressionWithArguments(file, expr, argumentMap, allowRegisters) {

    var cloned = expr.clone();
    cloned.walk(function(node) {
        if (node.type === 'MACRO_ARG') {
            replaceTokenWithArgument(file, node, argumentMap, allowRegisters);
        }
    });

    return cloned;

}

function replaceTokenWithArgument(file, token, argumentMap, allowRegisters) {

    if (argumentMap.hasOwnProperty(token.value)) {

        var arg = argumentMap[token.value];
        if (arg instanceof Macro.RegisterArgument) {

            if (allowRegisters !== true) {
                new Errors.ArgumentError(
                    file,
                    'Use of register arguments is not supported within expression macros',
                    token.index
                );
            }

            token.value = arg;
            token.type = 'NAME';

        } else {
            token.value = argumentMap[token.value];
            token.type = (typeof token.value).toUpperCase();
        }

    } else {
        new Errors.ArgumentError(
            file,
            'Use of undefined macro argument @' + token.value + ' in expression',
            token.index
        );
    }

}


// Exports --------------------------------------------------------------------
module.exports = Macro;

