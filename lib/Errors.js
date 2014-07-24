// Error Definitions ----------------------------------------------------------
// ----------------------------------------------------------------------------
module.exports = {

    ReferenceError: function(file, msg, index) {

        var s = file.getLineSource(index),
            message = 'ReferenceError: ' + msg;

        file.error(index, '\n' + s.source + '\n\n' + message.red);

    },

    AddressError: function(file, msg, index) {

        var s = file.getLineSource(index),
            message = 'AddressError: ' + msg;

        file.error(index, '\n' + s.source + '\n\n' + message.red);

    },

    ArgumentError: function(file, msg, index) {

        var s = file.getLineSource(index),
            message = 'ArgumentError: ' + msg;

        file.error(index, '\n' + s.source + '\n\n' + message.red);

    },

    DeclarationError: function(file, msg, index, existing) {

        var s = file.getLineSource(index),
            message = 'ParseError: ';

        if (existing) {
            message += 'Redeclaration of ' + msg;
            message += ', first declared in ' + existing.file.getPath(existing.index);

        } else {
            message += 'Declaration of ' + msg;
        }

        file.error(index, '\n' + s.source + '\n\n' + message.red);

    },

    IncludeError: function(file, err, msg, filePath, index) {

        var s = file.getLineSource(index),
            message = 'IncludeError: Unable to ' + msg + ' "' + filePath + '", ';

        if (err.errno === 34) {
            message += 'file was not found';

        } else {
            message += 'file could not be read';
        }

        file.error(index, '\n' + s.source + '\n\n' + message.red);

    },

    ParseError: function(file, msg, expected, index) {

        var s = file.getLineSource(index),
            message = 'ParseError: Unexpected ' + msg;

        if (expected) {
            message += ', expected ' + expected + ' instead';
        }

        file.error(index, '\n' + s.source + '\n\n' + message.red);

    }

};

