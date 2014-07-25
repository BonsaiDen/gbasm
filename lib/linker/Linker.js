// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var FileLinker = null,
    Macro = require('./Macro'),
    Errors = require('../Errors'),
    Expression = require('../parser/Expression');


// Global Linking Logic -------------------------------------------------------
// ----------------------------------------------------------------------------
var Linker = {

    // Order of Code Segments
    SegmentIndex: {
        ROM0: 0,
        ROMX: 1,
        WRAM0: 2,
        WRAMX: 3,
        HRAM: 4
    },


    // Static Methods ---------------------------------------------------------
    init: function(files) {

        // Order sections based on their offsets / banks
        var sections = getAllSections(files);
        sections.sort(function(a, b) {

            if (a.segment === b.segment) {

                if (a.bank === b.bank) {

                    if (a.isOffset && b.isOffset) {
                        return a.offset - b.offset;

                    } else if (a.isOffset) {
                        return -1;

                    } else {
                        return 1;
                    }

                } else {
                    return a.bank - b.bank;
                }

            } else {
                return Linker.SegmentIndex[a.segment]
                     - Linker.SegmentIndex[b.segment];
            }

        });

    },

    link: function(files) {

        // First calculate all initial addresses for all files
        files.forEach(FileLinker.init);

        // Now order and re-arrange the existing section and assign bases
        // addresses of sections without specific offset adresses
        var sectionsLastAddresses = {};
        getAllSections(files).forEach(function(section) {

            var id = section.segment + '#' + section.bank;

            // Place sections without a specified offset after other sections
            // in the machting segment / bank
            if (!section.isOffset) {
                section.resolvedOffset = sectionsLastAddresses[id] || section.resolvedOffset;
                section.calculateOffsets();
            }

            sectionsLastAddresses[id] = section.resolvedOffset + section.size;

        });

        // Link all files with the newly calculated addresses
        files.forEach(FileLinker.link);

    },


    // Name / Value / Expression Resolution -----------------------------------
    resolveValue: function(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack) {

        stack = stack || [];

        // Check for circular references while resolving
        if (stack.indexOf(value) !== -1) {

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

        } else {

            if (value.file === null) {
                value.file = sourceFile;
            }

            stack.push(value);

        }

        switch(value.type) {
            case 'NUMBER':
            case 'STRING':
                return value.value;

            case 'EXPRESSION':
                return Linker.resolveExpression(
                    value.value, sourceFile, sourceOffset, sourceIndex,
                    relativeOffset, stack
                );

            case 'NAME':
                return Linker.resolveNameValue(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack);

            case 'OFFSET':
                return relativeOffset ? value.value : sourceOffset + value.value;

            case 'LABEL_LOCAL_REF':
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
                break;

            default:
                throw new TypeError('Unresolved ' + value);
        }

    },

    resolveNameValue: function(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack) {

        var resolved = Linker.resolveName(value.value, sourceFile);
        if (resolved) {

            // Recursively resolve values
            if (resolved.hasOwnProperty('value')) {
                if (typeof resolved.value === 'object') {
                    return Linker.resolveValue(
                        resolved.file, resolved.value,
                        sourceOffset, resolved.value.index,
                        relativeOffset, stack
                    );

                } else {
                    return resolved.value;
                }

            } else if (resolved.hasOwnProperty('offset')) {
                if (relativeOffset) {
                    return resolved.offset - sourceOffset;

                } else {
                    return resolved.offset;
                }

            } else if (resolved instanceof Macro) {
                return resolved;
            }

        } else {

            if (value.charCodeAt(0) === 95) {

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

            } else {
                // TODO Show the reference path
                new Errors.ReferenceError(
                    value.file,
                    '"' + value.value + '" was not declared',
                    value.index
                );
            }

        }

    },

    resolveName: function(name, file, global) {

        // Check if their is a macro with the specified name
        if (Macro.isDefined(name)) {
            return Macro.get(name);
        }

        // Search all files for the name in question
        var files = file.compiler.files,
            value = null;

        if (name[0] === '_' && !global) {
            value = FileLinker.resolveName(file, name);

        } else {

            for(var i = 0, l = files.length; i < l; i++) {
                file = files[i],
                value = FileLinker.resolveName(file, name);
                if (value) {
                    break;
                }
            }

        }

        // Cache file reference on resolved value
        if (value) {
            value.file = file;
        }

        return value;

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
                    throw new TypeError('Incompatible operands for binary operator ' + node.op.id);

                } else {
                    return Linker.evaluateBinaryOperator(node.op.id, left, right);
                }

            } else {
                return Linker.evaluateUnaryOperator(node.op.id, left);
            }

        // Raw Values
        } else if (node instanceof Expression.Leaf) {
            return Linker.resolveValue(
                sourceFile, node.value, sourceOffset,
                node.value.index, false, stack
            );

        // Macro Calls
        } else if (node instanceof Expression.Call) {

            var callee = Linker.resolveValue(
                sourceFile, node.callee, sourceOffset,
                node.callee.index, false, stack
            );

            if (callee instanceof Macro) {

                var args = node.args.map(function(arg) {
                    return Linker.resolveValue(
                        sourceFile, arg.value, sourceOffset,
                        arg.value.index, false, stack
                    );
                });

                // TODO validate argument types
                return callee.handler.apply(null, args);

            } else {
                throw new TypeError('Call of undefined MACRO ' + node.callee.value);
            }

        }

    },

    evaluateBinaryOperator: function(op, left, right) {
        switch(op) {
            case '&':
                return (left & right) | 0;

            case '|':
                return (left | right) | 0;

            case '*':
                return (left * right) | 0;

            case '/':
                return Math.floor(left / right);

            case '%':
                return left % right;

            case '+':
                return (left + right) | 0;

            case '-':
                return (left - right) | 0;

            case '^':
                return (left ^ right) | 0;

            case '>>':
                return (left >> right) | 0;

            case '<<':
                return (left << right) | 0;

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
                throw new TypeError('Unhandled binary operator ' + op);
        }
    },

    evaluateUnaryOperator: function(op, arg) {
        switch(op) {
            case '!':
                return !arg ? 1 : 0;

            case '-':
                return -arg;

            case '~':
                return ~arg;

            default:
                throw new TypeError('Unhandled unnary operator ' + op);
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

