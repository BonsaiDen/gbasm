// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Label = require('./Label'),
    DataBlock = require('./DataBlock'),
    Instruction = require('./Instruction'),
    Variable = require('./Variable'),
    Binary = require('./Binary'),

    // Errors
    Errors = require('../Errors');


// ROM/RAM Sections -----------------------------------------------------------
// ----------------------------------------------------------------------------
function Section(file, name, segment, bank, offset, index) {

    this.file = file;
    this.nameIndex = name.index;
    this.name = name.value;
    this.segment = segment;
    this.bank = bank;

    this.size = 0;

    // Wether or not this section has a custom base address
    this.isOffset = offset !== null;

    // Specified offset and resolved offset in ROM
    // both are absolute and can exceed the 16bit address space
    this.offset = offset;
    this.resolvedOffset = offset;

    // Offset value used for labels to bring them back into the correct
    // 16bit address range
    this.bankOffset = 0;

    // Start offset of the nearest segment
    this.startOffest = 0;

    // Internal offset value used when caculating label addresses
    this.endOffset = 0;

    //
    this.isRam = false;
    this.isRom = false;

    this.signature = Section.Signature(this.segment, bank, offset);

    // Instructions, Data and everything else that was declared in t
    this.entries = [];

    // Check for valid segment name
    if (Section.Segments.hasOwnProperty(this.segment)) {
        this.initialize();

    } else {
        new Errors.ParseError(
            this.file,
            'section name "' + this.segment + '"', 'one of ' + Section.SegmentNames.join(', '),
            index
        );
    }

    // TODO check for overlapping entries across sections
    // TODO check for multiple sections as the same place

}


// Section Definitions --------------------------------------------------------
Section.Segments = {

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
    },

    HRAM: {
        baseOffset: 0xFF80,
        size: 0x7F,
        isRam: true,
        isRom: false,
        isBanked: false,
    }

};

Section.SegmentNames = Object.keys(Section.Segments).sort();

Section.Signature = function(segment, bank, offset) {
    return segment + '_' + bank + '_' + offset;
};


// Section Methods ------------------------------------------------------------
Section.prototype = {

    add: function(entry) {

        if (this.isRam) {
            if (entry instanceof Instruction) {
                throw new TypeError('Instruction is not allowed in RAM segment');

            } else if (entry instanceof DataBlock) {
                if (entry.values.length) {
                    throw new TypeError('Initialized DataBlock not allowed in RAM segment');
                }

            } else if (entry instanceof Binary) {
                throw new TypeError('Binary include not not allowed in RAM segment');
            }

        } else if (this.isRom) {
            if (entry instanceof Variable) {
                throw new TypeError('Variable can not be put in ROM segment');
            }
        }

        this.entries.push(entry);

    },

    calculateOffsets: function() {

        var offset = this.resolvedOffset,
            labelOffset = this.bankOffset,
            endOffset = this.endOffset;

        this.entries.forEach(function(entry) {

            if (entry instanceof Label) {
                // Remove bank offsets when calculating label addresses
                entry.offset = offset - labelOffset;

            } else {
                entry.offset = offset;
                offset += entry.size;

                if (offset > endOffset) {
                    // TODO use entry to pin point what exceeded the section bounds
                    throw new TypeError('Section exceeds bounds');
                }

            }

        });

        this.size = offset - this.resolvedOffset;

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
            new Errors.AddressError(
                this.file,
                'Unexpected bank index on non-bankable section',
                this.nameIndex
            );

        // Check for negative bank indicies
        } else if (this.bank < 0) {
            // TODO fix column index in error message
            new Errors.AddressError(
                this.file,
                'Negative bank indexes are not allowed',
                this.nameIndex
            );

        // Check for max bank
        } else if (segmentDefaults.isBanked && (this.bank < 1 || this.bank > segmentDefaults.maxBank)) {
            // TODO fix column index in error message
            new Errors.AddressError(
                this.file,
                'Invalid bank index, must be between 1 and ' + segmentDefaults.maxBank,
                this.nameIndex
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
                this.offset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize;
                this.bankOffset = this.offset - segmentDefaults.baseOffset;
            }

            // Caculate end of segment als data must lie in >= offset && <= endOffset
            this.startOffest = this.offset;
            this.endOffset = this.offset + segmentDefaults.size;

        // For sections with specified offsets we still need to correct for banking
        } else {

            if (this.bank === 0) {

                this.bankOffset = 0;
                this.endOffset = segmentDefaults.baseOffset + segmentDefaults.size;
                this.startOffest = segmentDefaults.baseOffset;

                if (this.offset < segmentDefaults.baseOffset || this.offset > this.endOffset) {
                    // TODO fix column index in error message
                    this.file.resolveError(
                        'Section offset out of range', 'Must be in range ' + segmentDefaults.baseOffset + '-' + this.endOffset,
                        this.nameIndex
                    );

                }

            } else {

                var baseBankOffset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize;
                this.endOffset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize + segmentDefaults.size;
                this.bankOffset = this.offset - segmentDefaults.baseOffset - (this.offset - baseBankOffset);
                this.startOffest = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize;

                if (this.offset < baseBankOffset || this.offset > this.endOffset) {
                    // TODO fix column index in error message
                    this.file.resolveError(
                        'Section offset out of range', 'Must be in range ' + baseBankOffset + '-' + this.endOffset,
                        this.nameIndex
                    );
                }

            }

        }

        // Set initial resolved offset
        this.resolvedOffset = this.offset;

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
            + (this.offset + this.size).toString(16)
            + ' of ' + this.endOffset.toString(16)
            + ' (base address is '
            + (this.offset - this.bankOffset).toString(16)
            + ')]';
    }

};


// Exports --------------------------------------------------------------------
module.exports = Section;

