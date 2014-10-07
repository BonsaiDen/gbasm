// Error Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
module.exports = {

    ReferenceError: function(file, msg, index) {
        file.error({
            index: index,
            name: 'ReferenceError',
            message: msg
        });
    },

    AddressError: function(file, msg, index) {
        file.error({
            index: index,
            name: 'AddressError',
            message: msg
        });
    },

    ArgumentError: function(file, msg, index) {
        file.error({
            index: index,
            name: 'ArgumentError',
            message: msg
        });
    },

    MacroError: function(file, msg, index, macro) {

        if (macro) {
            msg += ' ( MACRO declared in ' + macro.file.getPath(macro.index).yellow + ' )';
        }

        file.error({
            index: index,
            name: 'MacroError',
            message: msg
        });

    },

    ExpressionError: function(file, msg, index) {
        file.error({
            index: index,
            name: 'ExpressionError',
            message: msg
        });
    },

    DeclarationError: function(file, msg, index, existing) {

        if (existing) {
            msg = 'Redeclaration of ' + msg;
            msg += ' ( first declared in ' + existing.file.getPath(existing.index).yellow + ' )';

        } else {
            msg = 'Declaration of ' + msg;
        }

        file.error({
            index: index,
            name: 'ParseError',
            message: msg
        });

    },

    IncludeError: function(file, err, msg, filePath, index) {

        msg = 'Unable to ' + msg + ' "' + filePath + '", ';

        if (err.errno === 34) {
            msg += 'file was not found';

        } else {
            msg += 'file could not be read';
        }

        file.error({
            index: index,
            name: 'IncludeError',
            message: msg
        });

    },

    ParseError: function(file, msg, expected, index) {

        msg = 'Unexpected ' + msg;

        if (expected) {
            msg += ', expected ' + expected + ' instead';
        }

        file.error({
            index: index,
            name: 'ParseError',
            message: msg
        });

    }

};

