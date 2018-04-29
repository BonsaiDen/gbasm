// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
const Errors = require('../Errors'),
    Expression = require('../parser/Expression'),
    Parser = require('../parser/Parser'),
    TokenStream = require('../parser/TokenStream'),
    Lexer = require('../parser/Lexer');


// Macro Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
function Macro(file, name, args, tokens, index) {

    this.file = file;
    this.name = name;

    const argMap = {};
    this.args = args.map((arg) => {

        const name = arg.value;
        if (argMap.hasOwnProperty(name)) {
            Errors.DeclarationError(
                file,
                `macro argument @${  name}`,
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

    // Index in the source file
    this.index = index;

    // Wether this macro can be called in an expression context or not
    // (i.e. it does return a value)
    this.isExpression = tokens.length === 2 && tokens[0].type === 'EXPRESSION';

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
Macro.LabelPrefix = 0;
Macro.Map = {};

Macro.isDefined = function(name) {
    return Macro.Map.hasOwnProperty(name);
};

Macro.get = function(name) {
    return Macro.Map[name];
};


// Methods --------------------------------------------------------------------
Macro.prototype = {

    getExpressionForArguments(args) {
        return expressionWithArguments(
            this.file,
            this.tokens[0].value,
            getArgumentMap(this.args, args),
            false
        );
    },

    expand(macroName, section, offset, args) {

        const argumentMap = getArgumentMap(this.args, args);
        const prefix = Macro.LabelPrefix++;

        // Clone all tokens and expressions and replace macro agruments
        // with their computed values
        const tokens = this.tokens.map((original) => {

            const token = original.clone();

            if (token.value instanceof Expression.Call
                || token.value instanceof Expression.Node) {

                token.value = expressionWithArguments(
                    this.file,
                    token.value,
                    argumentMap,
                    true
                );

            } else if (token.type === 'MACRO_ARG') {
                replaceTokenWithArgument(this.file, token, argumentMap, true);

            } else if (token.type == 'LABEL_GLOBAL_DEF') {
                token.value = `macro_expansion_${prefix}-${token.value}`;

            } else if (token.type == 'LABEL_LOCAL_REF' || token.type == 'LABEL_LOCAL_DEF') {
                const to = `.macro_expansion_${prefix}-${token.value.replace(/^./, '')}`;
                token.value = to;
            }

            return token;

        });

        // Create a proxy for the section and its source file that allows the
        // parser to insert tokens into the already existing section entries
        const proxyFile = createFileProxy(macroName, section, offset),
            stream = new TokenStream(proxyFile, tokens),
            parser = new Parser(proxyFile, stream);

        // Parse the marco tokens into the existing file / section
        parser.parse();

    }

};


// Helpers --------------------------------------------------------------------
function createFileProxy(macroName, section, offset) {

    function SourceFileProxy(section) {

        this.currentSection = createSectionProxy(section, offset);

        this.addSection = function(name) {
            Errors.DeclarationError(
                this,
                'a SECTION cannot be defined within a macro',
                name.index
            );
        };

        /*
        var addLabel = section.file.addLabel;

        // TODO figure out how to resolve macro local names and have them stacked
        this.addLabel = function(name, parent, index) {
            name = macroName + '::' + name;
            console.log(name);
            return addLabel.call(this, name, parent, index);
        };
        */

    }

    SourceFileProxy.prototype = section.file;

    return new SourceFileProxy(section);

}

function createSectionProxy(section, offset) {

    function SectionProxy(offset) {
        this.add = function(entry) {
            this.addWithOffset(entry, offset);
            offset++;
        };
    }

    SectionProxy.prototype = section;

    return new SectionProxy(offset);

}

function getArgumentMap(expected, provided) {

    const map = {};
    expected.forEach((arg, index) => {
        map[arg.name] = provided[index];
    });

    return map;

}

function expressionWithArguments(file, expr, argumentMap, allowRegisters) {

    const cloned = expr.clone();

    function walker(node) {
        if (node.type === 'MACRO_ARG') {
            replaceTokenWithArgument(file, node, argumentMap, allowRegisters);

        } else if (node.type === 'EXPRESSION') {
            node.walk(walker);
        }
    }

    cloned.walk(walker);

    return cloned;

}

function replaceTokenWithArgument(file, token, argumentMap, allowRegisters) {

    if (argumentMap.hasOwnProperty(token.value)) {

        const arg = argumentMap[token.value];
        if (arg instanceof Macro.RegisterArgument) {

            if (allowRegisters !== true) {
                Errors.ArgumentError(
                    file,
                    'Use of register arguments is not supported within expression macros',
                    token.index
                );
            }

            token.value = arg.name;
            token.type = 'NAME';

        } else {

            const raw = argumentMap[token.value];

            // Names and other things
            if (raw instanceof Lexer.Token) {
                token.value = raw.value;
                token.type = raw.type;

            // Numbers and strings
            } else {
                token.value = raw;
                token.type = (typeof token.value).toUpperCase();
            }

        }

    } else {
        Errors.ArgumentError(
            file,
            `Use of undefined macro argument @${  token.value  } in expression`,
            token.index
        );
    }

}


// Exports --------------------------------------------------------------------
module.exports = Macro;

