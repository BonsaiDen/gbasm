// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
const BuiltinMacro = require('./Macro'),
    Errors = require('../Errors'),
    Token = require('../parser/Lexer').Token,
    Variable = require('../data/Variable'),
    Constant = require('../data/Constant'),
    Section = require('../data/Section'),
    Label = require('../data/Label'),
    Macro = require('../data/Macro'),
    Expression = require('../parser/Expression');

let FileLinker = null;

// Global Linking Logic -------------------------------------------------------
// ----------------------------------------------------------------------------
const Linker = {

    init(files) {

        // Order sections based on their offsets / banks
        const sections = Linker.getAllSections(files);
        sections.sort((a, b) => {

            if (a.segment === b.segment) {

                if (a.bank === b.bank) {

                    if (a.hasCustomBaseOffset && b.hasCustomBaseOffset) {
                        return a.baseOffset - b.baseOffset;

                    } else if (a.hasCustomBaseOffset) {
                        return -1;

                    }
                    return 1;


                }
                return a.bank - b.bank;


            }
            return Section.Segments[a.segment].index
                     - Section.Segments[b.segment].index;


        });

    },

    link(files, verify) {

        // First calculate all initial addresses for all files
        files.forEach(FileLinker.init);

        // Now order and re-arrange the existing section and assign bases
        // addresses of sections without specific offset adresses
        const sections = Linker.getAllSections(files),
            sectionsLastAddresses = {};

        sections.forEach((section) => {

            const id = `${section.segment  }#${  section.bank}`;

            // Place sections without a specified offset after other sections
            // in the machting segment / bank
            if (!section.hasCustomBaseOffset) {
                section.resolvedOffset = sectionsLastAddresses[id] || section.resolvedOffset;
                section.calculateOffsets();
            }

            sectionsLastAddresses[id] = section.resolvedOffset + section.size;

        });

        // Check for overlapping sections
        if (verify) {
            this.checkOverlap(sections);
        }

        // Link all files with the newly calculated addresses
        files.forEach(FileLinker.link);

    },

    checkOverlap(sections) {

        for(let i = 0; i < sections.length; i++) {
            for(let e = i + 1; e < sections.length; e++) {

                const b = sections[i],
                    a = sections[e];

                if (a.resolvedOffset + a.size > b.resolvedOffset
                    && a.resolvedOffset <= b.resolvedOffset + b.size - 1) {

                    if (a.resolvedOffset > b.resolvedOffset) {
                        Errors.AddressError(
                            a.file,
                            `Section overlaps with previously defined section ${  b.toString(true)
                            }. Previous section is ${  (b.resolvedOffset + b.size) - a.resolvedOffset  } byte(s) too long`,
                            a.nameIndex
                        );

                    } else {
                        Errors.AddressError(
                            a.file,
                            `Section overlaps with previously defined section ${  b.toString(true)
                            }. Section is ${  a.size  } byte(s) long, but only ${
                                b.resolvedOffset - a.resolvedOffset
                            } bytes(s) are available until the start of the next section.`,
                            a.nameIndex
                        );
                    }

                }

            }
        }

    },


    // Name / Value / Expression Resolution -----------------------------------
    resolveValue(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack, returnReference) {

        // Check for circular references during value resolution
        if (stack.indexOf(value) === -1) {
            stack.push(value);

            switch(value.type) {
                case 'NUMBER':
                case 'STRING':
                    return value.value;

                case 'NAME':
                    return Linker.resolveNameValue(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack, returnReference);

                case 'LABEL_LOCAL_REF':
                    return Linker.resolveLocalLabel(sourceFile, value, relativeOffset, sourceOffset);

                case 'EXPRESSION':
                    const resolved = Linker.resolveExpression(
                        value.value, sourceFile, sourceOffset, sourceIndex,
                        relativeOffset, stack
                    );
                    return typeof resolved === 'number' ? resolved | 0 : resolved;

                case 'OFFSET':
                    return relativeOffset ? value.value : sourceOffset + value.value;

                default:
                    throw new TypeError(`Unresolved ${  value.type  }(${  value.value  })`);
            }

        } else {
            Errors.ReferenceError(
                stack[0].file,
                `Circular reference of "${
                    stack[0].value
                }" to itself via ${
                    stack.slice(1).reverse().map((s) => {
                        return `${s.value  } in ${  s.file.getPath()}`;

                    }).join(' -> ')}`,
                stack[0].index
            );
        }

    },

    resolveLocalLabel(sourceFile, value, relativeOffset, sourceOffset) {

        const resolved = FileLinker.resolveLocalLabel(sourceFile, value);
        if (resolved) {

            resolved.references++;

            if (relativeOffset) {
                return resolved.offset - sourceOffset;

            }
            return resolved.offset;

        }
        Errors.ReferenceError(
            value.file,
            `Local label "${  value.value  }" not found in current scope`,
            value.index
        );


    },

    resolveNameValue(sourceFile, value, sourceOffset, sourceIndex, relativeOffset, stack, returnReference) {

        const resolved = Linker.resolveName(value.value, sourceFile);
        if (resolved) {

            resolved.references++;

            // Recursively resolve constants
            if (resolved instanceof Constant) {
                if (resolved.value instanceof Token) {
                    return Linker.resolveValue(
                        resolved.file, resolved.value,
                        sourceOffset, resolved.value.index,
                        relativeOffset, stack,
                        returnReference
                    );

                }
                return resolved.value;


            // Resolve Variable Values and Label Addresses
            } else if (resolved instanceof Variable || resolved instanceof Label) {

                // Force the callee to use the reference it passed in
                // This is needed for macros where we otherwise would pass
                // in the pre-computed label and variable addresses even
                // though the are subject to change during linkage
                if (returnReference || resolved.offset === -1) {
                    return null;

                } else if (relativeOffset) {
                    return resolved.offset - sourceOffset;

                }
                return resolved.offset;


            // Resolve builtint macro handlers
            } else if (resolved instanceof BuiltinMacro) {
                return resolved;

            // Resolve other pre-defined, built-in values
            }
            return resolved;


        // Error on missing local names
        } else if (value.value.charCodeAt(0) === 95) {

            const resolvedGlobal = Linker.resolveName(
                value.value, sourceFile, true
            );

            if (resolvedGlobal) {
                Errors.ReferenceError(
                    value.file,
                    `Local name "${
                        value.value
                    }" was not declared in current file, but found in ${
                        resolvedGlobal.file.getPath(resolvedGlobal.index, true)}`,
                    value.index
                );

            } else {
                Errors.ReferenceError(
                    value.file,
                    `Local name "${  value.value  }" was not declared`,
                    value.index
                );
            }

        // Error on missing global names
        } else {
            // TODO Show the reference path
            Errors.ReferenceError(
                value.file,
                `"${  value.value  }" was not declared`,
                value.index
            );
        }

    },

    resolveName(name, file, global) {

        // Check if their is a builtin macro with the specified name
        if (BuiltinMacro.isDefined(name)) {
            return BuiltinMacro.get(name);

        // Names prefixed with _ will only be looked up in their own file
        } else if (!global && name.charCodeAt(0) === 95) {
            return file.names[name];

        // All other names will be searched globally
        }

        const files = file.compiler.files;
        for(let i = 0, l = files.length; i < l; i++) {
            file = files[i];

            const value = file.names[name];
            if (value) {
                return value;
            }
        }

        return null;



    },

    resolveExpression(node, sourceFile, sourceOffset, sourceIndex, relativeOffset, stack) {

        // Binary Expressions
        if (node instanceof Expression.Node) {

            const left = Linker.resolveExpression(
                node.left, sourceFile, sourceOffset, sourceIndex,
                relativeOffset, stack
            );

            if (node.right) {

                const right = Linker.resolveExpression(
                    node.right, sourceFile, sourceOffset, sourceIndex,
                    relativeOffset, stack
                );

                if (typeof left !== typeof right) {
                    Errors.ExpressionError(
                        sourceFile,
                        `Incompatible operand types ${
                            (typeof left).toUpperCase()
                        } and ${
                            (typeof right).toUpperCase()
                        } for binary operator ${  node.op.id}`,
                        node.op.index
                    );

                } else {
                    return Linker.evaluateBinaryOperator(node.op.id, left, right);
                }

            } else if (typeof left === 'number') {
                return Linker.evaluateUnaryOperator(node.op.id, left);

            } else{
                Errors.ExpressionError(
                    sourceFile,
                    `Invalid operand type ${
                        (typeof left).toUpperCase()
                    } for unary operator ${  node.op.id}`,
                    node.left.value.index
                );
            }

        // Raw Values
        } else if (node instanceof Expression.Leaf) {
            return Linker.resolveValue(
                sourceFile, node.value, sourceOffset,
                node.value.index, false, stack,
                false
            );

        // Macro Calls
        } else if (node instanceof Expression.Call) {

            const macro = Linker.resolveMacro(node, sourceFile, sourceOffset, stack);

            // Builtin macros are basically just plain JavaScript functions
            if (macro.isBuiltin) {
                return macro.callee.func.apply(null, macro.args);

            // For use in expressions, only macros which return a value can be
            // used
            } else if (macro.isExpression) {

                const expr = macro.callee.getExpressionForArguments(macro.args);
                return Linker.resolveExpression(
                    expr, sourceFile, sourceOffset, sourceIndex,
                    relativeOffset, stack
                );

            // Expansion macros are not suited
            }
            Errors.MacroError(
                sourceFile,
                `User defined expansion MACRO ${  macro.name
                } cannot be used as a value`,
                node.callee.index,
                macro.callee
            );

        }

    },

    resolveMacro(node, sourceFile, sourceOffset, stack) {

        let callee = null;

        // Check for builtin macros
        if (!BuiltinMacro.isDefined(node.callee.value)) {

            if (!Macro.isDefined(node.callee.value)) {
                Errors.ExpressionError(
                    sourceFile,
                    `Call of undefined MACRO function "${  node.callee.value  }"`,
                    node.callee.index
                );

            } else {
                callee = Macro.get(node.callee.value);
            }

        } else {
            callee = BuiltinMacro.get(node.callee.value);
        }

        if (node.args.length > callee.args.length) {
            Errors.ExpressionError(
                sourceFile,
                `Too many arguments for ${
                    callee.name
                }, macro takes at most ${
                    callee.args.length
                } arguments`,
                node.args[0].value.index
            );

        } else if (node.args.length < callee.args.length) {
            Errors.ExpressionError(
                sourceFile,
                `Too few arguments for ${
                    callee.name
                }, macro takes at least ${
                    callee.args.length
                } arguments`,
                node.callee.index
            );

        } else {

            const args = node.args.map((arg, index) => {

                return Linker.resolveMacroArgument(
                    arg, callee.args[index],
                    sourceFile,
                    sourceOffset,
                    stack
                );

            });

            return {
                name: node.callee.value,
                callee,
                args,
                isBuiltin: callee instanceof BuiltinMacro,
                isExpression: !!callee.isExpression
            };

        }

    },

    resolveMacroArgument(arg, expected, sourceFile, sourceOffset, stack) {

        // Support Register Arguments
        if (expected.type === 'any'
            && arg.value && arg.value.type === 'NAME'
            && isRegisterArgument(arg.value.value)) {

            return new Macro.RegisterArgument(arg.value.value);

        }

        let value;

        // Macro call arguments
        if (arg instanceof Expression.Call) {
            value = Linker.resolveExpression(
                arg, sourceFile, sourceOffset,
                arg.callee.index, false, stack
            );

            // Other values
        } else {
            value = Linker.resolveValue(
                sourceFile, arg.value, sourceOffset,
                arg.value.index, false, stack,
                true
            );
        }


        // In case we resolve labels, we cannot assume a final offset here
        // and have to defer the resolution of the value
        if (expected.type !== 'any' && typeof value !== expected.type) {

            // Error out if we couldn't resolve the value i.e. a address that
            // has no valid offset just yet
            if (value === null) {
                Errors.MacroError(
                    sourceFile,
                    `Cannot resolve computed address for static macro argument ${
                        expected.name  }.`,
                    arg.value.index
                );
            }

            Errors.ExpressionError(
                sourceFile,
                `Invalid type for MACRO argument: ${
                    expected.name
                } is expected to be of type ${  expected.type.toUpperCase()
                } but was ${  (typeof value).toUpperCase()
                } instead`,
                arg.value.index
            );

            // Address values might not have been resolved yet
        } else if (value === null) {
            return arg.value;

        } else {
            return value;
        }



    },

    evaluateBinaryOperator(op, left, right) {
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
                }
                return left + right;

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
                throw new TypeError(`Unimplemented binary operator: ${  op}`);
        }
    },

    evaluateUnaryOperator(op, arg) {
        switch(op) {
            case '!':
                return !arg ? 1 : 0;

            case '-':
                return -arg;

            case '~':
                return (~arg) | 0;

            default:
                throw new TypeError(`Unimplemented unary operator: ${  op}`);
        }
    },


    // Optimization -----------------------------------------------------------
    optimize(files, unsafe) {

        // Optimize instructions
        files.forEach((file) => {
            FileLinker.optimize(file, unsafe);
        });

        // Now relink with the changed addresses
        Linker.link(files, true);

    },

    getAllSections(files) {

        const sections = [];
        files.forEach((file) => {
            sections.push.apply(sections, file.sections);
        });

        return sections;

    }

};


// Helpers --------------------------------------------------------------------
function isRegisterArgument(arg) {
    return arg === 'a' || arg === 'b'
        || arg === 'c' || arg === 'd'
        || arg === 'e' || arg === 'h'
        || arg === 'l' || arg === 'hl'
        || arg === 'de' || arg === 'bc'
        || arg === 'af' || arg === 'sp';
}


// Exports --------------------------------------------------------------------
module.exports = Linker;


// After Dependencies ---------------------------------------------------------
FileLinker = require('./FileLinker');

