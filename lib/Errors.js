// Error Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
module.exports = {

    ReferenceError(file, msg, index) {
        file.error({
            index,
            name: 'ReferenceError',
            message: msg
        });
    },

    AddressError(file, msg, index) {
        file.error({
            index,
            name: 'AddressError',
            message: msg
        });
    },

    ArgumentError(file, msg, index) {
        file.error({
            index,
            name: 'ArgumentError',
            message: msg
        });
    },

    MacroError(file, msg, index, macro) {

        if (macro) {
            msg += ` ( MACRO declared in ${  macro.file.getPath(macro.index).yellow  } )`;
        }

        file.error({
            index,
            name: 'MacroError',
            message: msg
        });

    },

    ExpressionError(file, msg, index) {
        file.error({
            index,
            name: 'ExpressionError',
            message: msg
        });
    },

    DeclarationError(file, msg, index, existing) {

        if (existing) {
            msg = `Redeclaration of ${  msg}`;
            msg += ` ( first declared in ${  existing.file.getPath(existing.index).yellow  } )`;

        } else {
            msg = `Declaration of ${  msg}`;
        }

        file.error({
            index,
            name: 'DeclarationError',
            message: msg
        });

    },

    IncludeError(file, err, msg, filePath, index) {

        msg = `Unable to ${  msg  } "${  filePath  }", `;

        if (err.errno === 34) {
            msg += 'file was not found';

        } else {
            msg += 'file could not be read';
        }

        file.error({
            index,
            name: 'IncludeError',
            message: msg
        });

    },

    ParseError(file, msg, expected, index) {

        msg = `Unexpected ${  msg}`;

        if (expected) {
            msg += `, expected ${  expected  } instead`;
        }

        file.error({
            index,
            name: 'ParseError',
            message: msg
        });

    },

    SectionError(file, msg, index) {

        msg = `${msg}`;

        file.error({
            index,
            name: 'SectionError',
            message: msg
        });

    }


};

