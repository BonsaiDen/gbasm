// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var FileLinker = null,
    Macro = require('../util/Macro'),
    vm = require('vm');


// Global Linking Logic -------------------------------------------------------
// ----------------------------------------------------------------------------
var Linker = {

    // VM context for expression evalualtion
    context: false,

    // Order of Code Segments
    SegmentIndex: {
        ROM0: 0,
        ROMX: 1,
        WRAM0: 2,
        WRAMX: 3,
        HRAM: 4
    },


    // Static Methods ---------------------------------------------------------
    reset: function() {

        // Create a fresh expression evaluation context
        Linker.context = vm.createContext({});
        vm.runInContext(
            'var ' + [
                'eval', 'Object', 'Function', 'Array', 'String', 'Boolean',
                'Number', 'Date', 'RegExp', 'Error', 'EvalError', 'RangeError',
                'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'
            ].join(' = ') + ' = undefined',
            Linker.context,
            'gbasm'
        );

        // Expose macro implementations to the context
        Macro.defineMacros(Linker.context);

    },

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
        var sections = getAllSections(files),
            sectionsLastAddresses = {};

        sections.forEach(function(section) {

            var id = section.segment + '[' + section.bank + ']';

            // Place sections without a specified offset after other sections
            // in the machting segment / bank
            if (!section.isOffset) {
                section.resolvedOffset = sectionsLastAddresses[id] || section.resolvedOffset;
                section.calculateOffsets();

            } else {
                sections.resolvedOffset = section.offset;
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

            // TODO clean up error formatting
            stack[0].file.referenceError(
                'Circular reference of "'  + stack[0].value + '" to itself via ' + stack.slice(1).reverse().map(function(s) {
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

        var resolved = null;
        switch(value.type) {
            case 'NUMBER':
            case 'STRING':
                return value.value;

            case 'EXPRESSION':

                // Resolve all parts of the expression and convert it into
                // a string
                var expression = value.value.map(function(item) {
                    switch(item.type) {
                        case 'OPERATOR':
                        case 'LPAREN':
                        case 'RPAREN':
                        case 'NUMBER':
                            return item.value;

                        case 'STRING':
                            return '"' + item.value + '"';

                        default:
                            var resolved = Linker.resolveValue(
                                sourceFile, item, sourceOffset,
                                item.index, false, stack
                            );

                            if (resolved instanceof Macro) {
                                return resolved.name;

                            } else if (typeof resolved === 'string') {
                                return '"' + resolved + '"';

                            } else {
                                return resolved;
                            }
                    }

                }).join(' ');

                // Evaluate the converted JS string
                try {
                    resolved = vm.runInContext(expression, Linker.context, 'gbasm');

                    // Round everything down
                    if (typeof resolved === 'number') {
                        resolved = Math.floor(resolved);
                    }

                } catch(e) {
                    sourceFile.argumentError(
                        'Failed to evaluate expression, invalid syntax',
                        sourceIndex
                    );
                }

                return resolved;

            case 'NAME':
                resolved = Linker.resolveName(value.value, sourceFile);
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

                    if (value.value[0] === '_') {

                        var resolvedGlobal = Linker.resolveName(
                            value.value, sourceFile, true
                        );

                        if (resolvedGlobal) {
                            value.file.referenceError(
                                'Local name "' + value.value + '" was not declared in current file, but found in ' + resolvedGlobal.file.getPath(resolvedGlobal.index, true),
                                value.index
                            );

                        } else {
                            value.file.referenceError(
                                'Local name "' + value.value + '" was not declared',
                                value.index
                            );
                        }

                    } else {
                        // TODO Show the reference path
                        value.file.referenceError(
                            '"' + value.value + '" was not declared',
                            value.index
                        );
                    }

                }
                break;

            case 'OFFSET':
                return relativeOffset ? value.value : sourceOffset + value.value;

            case 'LABEL_LOCAL_REF':
                resolved = FileLinker.resolveLocalLabel(sourceFile, value);
                if (resolved) {
                    if (relativeOffset) {
                        return resolved.offset - sourceOffset;

                    } else {
                        return resolved.offset;
                    }

                } else {
                    // Reference Error:
                    value.file.referenceError(
                        'Local label "' + value.value + '" not found in current scope',
                        value.index
                    );
                }
                break;

            default:
                throw new TypeError('Unresolved ' + value);
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

