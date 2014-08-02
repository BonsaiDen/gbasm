// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var FileLinker = null,
    Macro = require('./Macro'),
    Errors = require('../Errors'),
    Token = require('../parser/Lexer').Token,
    Variable = require('../data/Variable'),
    Constant = require('../data/Constant'),
    Section = require('../data/Section'),
    Label = require('../data/Label'),
    Expression = require('../parser/Expression');


// Global Linking Logic -------------------------------------------------------
// ----------------------------------------------------------------------------
var Linker = {

    init: function(files) {

        // Order sections based on their offsets / banks
        var sections = getAllSections(files);
        sections.sort(function(a, b) {

            if (a.segment === b.segment) {

                if (a.bank === b.bank) {

                    if (a.hasCustomBaseOffset && b.hasCustomBaseOffset) {
                        return a.baseOffset - b.baseOffset;

                    } else if (a.hasCustomBaseOffset) {
                        return -1;

                    } else {
                        return 1;
                    }

                } else {
                    return a.bank - b.bank;
                }

            } else {
                return Section.Segments[a.segment].index
                     - Section.Segments[b.segment].index;
            }

        });

    },

    link: function(files) {

        // First calculate all initial addresses for all files
        files.forEach(FileLinker.init);

        // Now order and re-arrange the existing section and assign bases
        // addresses of sections without specific offset adresses
        var sections = getAllSections(files),
            sectionsLastAddresses = {};

        sections.forEach(function(section) {

            var id = section.segment + '#' + section.bank;

            // Place sections without a specified offset after other sections
            // in the machting segment / bank
            if (!section.hasCustomBaseOffset) {
                section.resolvedOffset = sectionsLastAddresses[id] || section.resolvedOffset;
                section.calculateOffsets();
            }

            sectionsLastAddresses[id] = section.resolvedOffset + section.size;

        });

        // Check for overlapping sections
        for(var i = 0; i < sections.length; i++) {
            for(var e = i + 1; e < sections.length; e++) {

                var b = sections[i],
                    a = sections[e];

                if (a.resolvedOffset >= b.resolvedOffset && a.resolvedOffset < b.resolvedOffset + b.size - 1) {
                    new Errors.AddressError(a.file, 'Section overlaps with previously defined section ' + b.toString(), a.nameIndex);
                }

            }
        }

        // Link all files with the newly calculated addresses
        files.forEach(FileLinker.link);

    },


    // Name / Value / Expression Resolution -----------------------------------
    resolveValue: function(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack) {

        // Check for circular references during value resolution
        if (stack.indexOf(value) === -1) {
            stack.push(value);

            switch(value.type) {
                case 'NUMBER':
                case 'STRING':
                    return value.value;

                case 'NAME':
                    return Linker.resolveNameValue(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack);

                case 'LABEL_LOCAL_REF':
                    return Linker.resolveLocalLabel(sourceFile, value, relativeOffset, sourceOffset);

                case 'EXPRESSION':
                    var resolved = Linker.resolveExpression(
                        value.value, sourceFile, sourceOffset, sourceIndex,
                        relativeOffset, stack
                    );
                    return typeof resolved === 'number' ? resolved | 0 : resolved;

                case 'OFFSET':
                    return relativeOffset ? value.value : sourceOffset + value.value;

                default:
                    throw new TypeError('Unresolved ' + value.type + '(' + value.value + ')');
            }

        } else {

            // TODO more detailed error message (include locations of the other names)
            new Errors.ReferenceError(
                stack[0].file,
                'Circular reference of "'
                + stack[0].value
                + '" to itself via '
                + stack.slice(1).reverse().map(function(s) {
                    return s.value + ' in ' + s.file.getPath();

                }).join(' -> '),
                stack[0].index
            );

        }

    },

    resolveLocalLabel: function(sourceFile, value, relativeOffset, sourceOffset) {

        var resolved = FileLinker.resolveLocalLabel(sourceFile, value);
        if (resolved) {
            if (relativeOffset) {
                return resolved.offset - sourceOffset;

            } else {
                return resolved.offset;
            }

        } else {
            new Errors.ReferenceError(
                value.file,
                'Local label "' + value.value + '" not found in current scope',
                value.index
            );
        }

    },

    resolveNameValue: function(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack) {

        var resolved = Linker.resolveName(value.value, sourceFile);
        if (resolved) {

            // Recursively resolve constants
            if (resolved instanceof Constant) {
                if (resolved.value instanceof Token) {
                    return Linker.resolveValue(
                        resolved.file, resolved.value,
                        sourceOffset, resolved.value.index,
                        relativeOffset, stack
                    );

                } else {
                    return resolved.value;
                }

            // Resolve Variable Values and Label Addresses
            } else if (resolved instanceof Variable || resolved instanceof Label) {
                if (relativeOffset) {
                    return resolved.offset - sourceOffset;

                } else {
                    return resolved.offset;
                }

            // Resolve macro handlers
            } else if (resolved instanceof Macro) {
                return resolved;

            // Resolve other pre-defined, built-in values
            } else {
                return resolved;
            }

        // Error on missing local names
        } else if (value.value.charCodeAt(0) === 95) {

            var resolvedGlobal = Linker.resolveName(
                value.value, sourceFile, true
            );

            if (resolvedGlobal) {
                new Errors.ReferenceError(
                    value.file,
                    'Local name "'
                    + value.value
                    + '" was not declared in current file, but found in '
                    + resolvedGlobal.file.getPath(resolvedGlobal.index, true),
                    value.index
                );

            } else {
                new Errors.ReferenceError(
                    value.file,
                    'Local name "' + value.value + '" was not declared',
                    value.index
                );
            }

        // Error on missing global names
        } else {
            // TODO Show the reference path
            new Errors.ReferenceError(
                value.file,
                '"' + value.value + '" was not declared',
                value.index
            );
        }

    },

    resolveName: function(name, file, global) {

        // Check if their is a macro with the specified name
        if (Macro.isDefined(name)) {
            return Macro.get(name);

        // Names prefixed with _ will only be looked up in their own file
        } else if (!global && name.charCodeAt(0) === 95) {
            return file.names[name];

        // All other names will be searched globally
        } else {

            var files = file.compiler.files;
            for(var i = 0, l = files.length; i < l; i++) {
                file = files[i];

                var value = file.names[name];
                if (value) {
                    return value;
                }
            }

            return null;

        }

    },

    resolveExpression: function(node, sourceFile, sourceOffset, sourceIndex, relativeOffset, stack) {

        // Binary Expressions
        if (node instanceof Expression.Node) {

            var left = Linker.resolveExpression(
                    node.left, sourceFile, sourceOffset, sourceIndex,
                    relativeOffset, stack
                );

            if (node.right) {

                var right = Linker.resolveExpression(
                    node.right, sourceFile, sourceOffset, sourceIndex,
                    relativeOffset, stack
                );

                if (typeof left !== typeof right) {
                    new Errors.ExpressionError(
                        sourceFile,
                        'Incompatible operand types '
                        + (typeof left).toUpperCase()
                        + ' and '
                        + (typeof right).toUpperCase()
                        + ' for binary operator ' + node.op.id,
                        node.op.index
                    );

                } else {
                    return Linker.evaluateBinaryOperator(node.op.id, left, right);
                }

            } else if (typeof left === 'number') {
                return Linker.evaluateUnaryOperator(node.op.id, left);

            } else{
                new Errors.ExpressionError(
                    sourceFile,
                    'Invalid operand type '
                    + (typeof left).toUpperCase()
                    + ' for unary operator ' + node.op.id,
                    node.left.value.index
                );
            }

        // Raw Values
        } else if (node instanceof Expression.Leaf) {
            return Linker.resolveValue(
                sourceFile, node.value, sourceOffset,
                node.value.index, false, stack
            );

        // Macro Calls
        } else if (node instanceof Expression.Call) {

            if (!Macro.isDefined(node.callee.value)) {
                new Errors.ExpressionError(
                    sourceFile,
                    'Call of undefined MACRO function "' + node.callee.value + '"',
                    node.callee.index
                );
            }

            var callee = Macro.get(node.callee.value);
            var args = node.args.map(function(arg, index) {

                var value = Linker.resolveValue(
                    sourceFile, arg.value, sourceOffset,
                    arg.value.index, false, stack
                );

                if (typeof value !== callee.args[index]) {
                    new Errors.ExpressionError(
                        'Invalid type for MACRO argument, '
                        + 'expected ' + callee.args[index].toUpperCase()
                        + ' but got ' + (typeof value).toUpperCase()
                        + ' instead',
                        sourceFile, arg.value.index
                    );

                } else {
                    return value;
                }

            });

            return callee.handler.apply(null, args);

        }

    },

    evaluateBinaryOperator: function(op, left, right) {
        switch(op) {

            // Binary
            case '&':
                return (left & right) | 0;

            case '|':
                return (left | right) | 0;


            case '^':
                return (left ^ right) | 0;

            // Math
            case '+':
                if (typeof left === 'string') {
                    return left + right;

                } else {
                    return left + right;
                }
                break;

            case '-':
                return left - right;

            case '*':
                return left * right;

            case '/':
                return left / right;

            case '%':
                return left % right;

            case '**':
                return Math.pow(left, right);

            // Shift
            case '>>':
                return (left >> right) | 0;

            case '<<':
                return (left << right) | 0;

            // Comparisons
            case '>':
                return left > right ? 1 : 0;

            case '>=':
                return left >= right ? 1 : 0;

            case '<':
                return left < right ? 1 : 0;

            case '<=':
                return left <= right ? 1 : 0;

            case '==':
                return left === right ? 1 : 0;

            case '!=':
                return left !== right ? 1 : 0;

            default:
                throw new TypeError('Unimplemented binary operator: ' + op);
        }
    },

    evaluateUnaryOperator: function(op, arg) {
        switch(op) {
            case '!':
                return !arg ? 1 : 0;

            case '-':
                return -arg;

            case '~':
                return (~arg) | 0;

            default:
                throw new TypeError('Unimplemented unary operator: ' + op);
        }
    },


    // Optimization -----------------------------------------------------------
    optimize: function(files) {

        // Optimize instructions
        files.forEach(FileLinker.optimize);

        // Now relink with the changed addresses
        Linker.link(files);

    }

};



// Helpers --------------------------------------------------------------------
function getAllSections(files) {

    var sections = [];
    files.forEach(function(file) {
        sections.push.apply(sections, file.sections);
    });

    return sections;

}


// Exports --------------------------------------------------------------------
module.exports = Linker;


// After Dependencies ---------------------------------------------------------
FileLinker = require('./FileLinker');

