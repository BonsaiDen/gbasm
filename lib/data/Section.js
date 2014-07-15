// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Label = require('./Label');


// ROM/RAM Sections -----------------------------------------------------------
// ----------------------------------------------------------------------------
function Section(file, name, segment, bank, offset, line, col) {

    this.file = file;
    this.name = name.value;

    this.segment = segment;
    this.offset = offset;
    this.bank = bank;

    this.bankOffset = 0;
    this.endOffset = 0;
    this.isRam = false;
    this.isRam = false;
    this.signature = Section.Signature(this.segment, bank, offset);

    this.entries = [];

    // TODO check for overlapping entries across sections
    // TODO check for multiple sections as the same place

    // Check for valid segment name
    if (Section.Segments.hasOwnProperty(this.segment)) {
        this.initialize();

    } else {
        this.file.parseError(
            'section name "' + this.segment + '"', 'one of ' + Section.SegmentNames.join(', '),
            line, col
        );
    }

}


// Section Definitions --------------------------------------------------------
Section.Segments = {

    HRAM: {
        baseOffset: 0xFF00,
        size: 0xFF,
        isRam: true,
        isRom: false,
        isBanked: false,
    },

    ROM0: {
        baseOffset: 0x0000,
        size: 0x3FFF,
        isRam: false,
        isRom: true
    },

    ROMX: {
        baseOffset: 0x4000,
        bankSize: 0x4000,
        maxBank: 128,
        size: 0x3FFF,
        isRam: false,
        isRom: true,
        isBanked: true
    },

    WRAM0: {
        baseOffset: 0xC000,
        size: 0x0FFF,
        isRam: true,
        isRom: false
    },

    WRAMX: {
        baseOffset: 0xD000,
        size: 0x0FFF,
        bankSize: 0x0000,
        maxBank: 8,
        isRam: true,
        isRom: false,
        isBanked: true
    }

};

Section.SegmentNames = Object.keys(Section.Segments).sort();

Section.Signature = function(segment, bank, offset) {
    return segment + '_' + bank + '_' + offset;
};


// Section Methods ------------------------------------------------------------
Section.prototype = {

    add: function(entry) {
        this.entries.push(entry);
    },

    calculateOffsets: function() {

        var offset = this.offset,
            labelOffset = this.bankOffset;

        this.entries.forEach(function(entry) {

            if (entry instanceof Label) {
                // Remove bank offsets when calculating label addresses
                entry.offset = offset - labelOffset;

            } else {
                entry.offset = offset;
                offset += entry.size;
            }

        });

        // TODO check if data.offset is in range of section
        // TODO check if data.offset + size is in range of section
        // TODO for data and instructions check if section can contain data
        // TODO for variables check if section is writable

    },

    initialize: function() {

        var segmentDefaults = Section.Segments[this.segment];

        // Default Bank
        if (this.bank === null && segmentDefaults.isBanked) {
            this.bank = 1;

        } else if (this.bank === null) {
            this.bank = 0;
        }

        // Check if the segment is banked
        if (this.bank > 0 && !segmentDefaults.isBanked) {
            // TODO fix column index in error message
            this.file.parseError(
                'section bank index on non-bankable section', null,
                this.name.line, this.name.col
            );

        // Check for negative bank indicies
        } else if (this.bank < 0) {
            // TODO fix column index in error message
            this.file.parseError(
                'negative bank index', null,
                this.name.line, this.name.col
            );

        // Check for max bank
        } else if (segmentDefaults.isBanked && (this.bank < 1 || this.bank > segmentDefaults.maxBank)) {
            // TODO fix column index in error message
            this.file.resolveError(
                'Section bank index out of range', 'Must be in range 1-' + segmentDefaults.maxBank,
                this.name.line, this.name.col
            );
        }


        // Set default offset if not specified
        if (this.offset === null) {

            // If we're in bank 0 we just use the base offset
            if (this.bank === 0) {
                this.bankOffset = 0;
                this.offset = segmentDefaults.baseOffset;

            // Otherwise we use the base offset + bank * bankSize
            // and also setup our bankOffset in order to correct label offsets
            } else {
                this.offset = segmentDefaults.baseOffset + (this.bank - 1)* segmentDefaults.bankSize;
                this.bankOffset = this.offset - segmentDefaults.baseOffset;
            }

            // Caculate end of segment als data must lie in >= offset && <= endOffset
            this.endOffset = this.offset + segmentDefaults.size;

        // For sections with specified offsets we still need to correct for banking
        } else {

            if (this.bank === 0) {
                this.bankOffset = 0;
                this.endOffset = segmentDefaults.baseOffset + segmentDefaults.size;

                if (this.offset < segmentDefaults.baseOffset || this.offset > this.endOffset) {
                    // TODO fix column index in error message
                    this.file.resolveError(
                        'Section offset out of range', 'Must be in range ' + segmentDefaults.baseOffset + '-' + this.endOffset,
                        this.name.line, this.name.col
                    );

                }

            } else {

                var baseBankOffset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize;
                this.endOffset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize + segmentDefaults.size;
                this.bankOffset = this.offset - segmentDefaults.baseOffset - (this.offset - baseBankOffset);

                if (this.offset < baseBankOffset || this.offset > this.endOffset) {
                    // TODO fix column index in error message
                    this.file.resolveError(
                        'Section offset out of range', 'Must be in range ' + baseBankOffset + '-' + this.endOffset,
                        this.name.line, this.name.col
                    );
                }

            }

        }

        // Set storage flags
        this.isRam = segmentDefaults.isRam;
        this.isRom = segmentDefaults.isRom;

    },

    toString: function() {
        return '[Section '
            + '"' + this.name + '" in '
            + this.segment + '[' + this.bank + '] @ '
            + this.offset.toString(16)
            +  ' to '
            + this.endOffset.toString(16)
            + ' (base address is '
            + (this.offset - this.bankOffset).toString(16)
            + ')]';
    }

};


// Exports --------------------------------------------------------------------
module.exports = Section;

