// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Label = require('./Label');


// ROM/RAM Sections -----------------------------------------------------------
// ----------------------------------------------------------------------------
function Section(file, name, segment, offset) {

    this.file = file;
    this.name = name;
    this.segment = segment;
    this.offset = offset;
    this.type = null;
    this.entries = [];

    // TODO check if section is a valid name
    // TODO check for overlapping sections
    // TODO set default offset if none is given


}


// Section Definitions --------------------------------------------------------
Section.Sections = {

    HRAM: {
        offset: 0xFF00,
        size: 0xFF,
        writable: true,
        data: false
    },

    ROM0: {
        offset: 0x0000,
        size: 0x7FFF,
        writable: false,
        data: true
    },

    ROMX: {
        base: 0x4000,
        size: 0x4000,
        writable: false,
        data: true
    },

    WRAM0: {
        offset: 0xC000,
        size: 0x0FFF,
        writable: true,
        data: false
    },

    WRAMX: {
        base: 0xD000,
        size: 0x0FFF,
        writable: true,
        data: false
    }

};


// Section Methods ------------------------------------------------------------
Section.prototype = {

    add: function(entry) {
        // TODO check if data.offset is in range of section
        // TODO check if data.offset + size is in range of section
        // TODO for data and instructions check if section can contain data
        // TODO for variables check if section is writable
        this.entries.push(entry);
    },

    calculateOffsets: function() {

        var offset = this.offset;
        this.entries.forEach(function(entry) {

            if (entry instanceof Label) {
                entry.offset = offset;

            } else {
                entry.offset = offset;
                offset += entry.size;
            }

        });

    }
};


// Exports --------------------------------------------------------------------
module.exports = Section;

