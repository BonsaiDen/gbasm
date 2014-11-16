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
    this.hasCustomBaseOffset = offset !== null;

    // Specified offset address in code
    this.baseOffset = offset;

    // Resolved offset address in ROM, can exceeded 16bit address space
    this.resolvedOffset = offset;

    // Offset value used for labels to bring them back into the
    // 16bit address range
    this.bankOffset = 0;

    // Start offset of the nearest segment
    this.startOffest = 0;

    // Internal offset value used when caculating label addresses
    this.endOffset = 0;

    // Flags
    this.isRam = false;

    // Instructions, Data and everything else that was declared in t
    this.entries = [];

    // Expansion Macro Calls in this Section
    this.macros = [];

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

    // TODO check for multiple sections as the same place

}


// Section Definitions --------------------------------------------------------
Section.Segments = {

    ROM0: {
        baseOffset: 0x0000,
        size: 0x4000,
        isRam: false,
        index: 0
    },

    ROMX: {
        baseOffset: 0x4000,
        bankSize: 0x4000,
        maxBank: 127,
        size: 0x4000,
        isRam: false,
        isBanked: true,
        index: 1
    },

    WRAM0: {
        baseOffset: 0xC000,
        size: 0x1000,
        isRam: true,
        index: 2
    },

    WRAMX: {
        baseOffset: 0xD000,
        size: 0x1000,
        bankSize: 0x0000,
        maxBank: 1,
        isRam: true,
        isBanked: true,
        index: 3
    },

    HRAM: {
        baseOffset: 0xFF80,
        size: 0x80,
        isRam: true,
        isBanked: false,
        index: 4
    },

    RAM: {
        baseOffset: 0xA000,
        size: 0x2000,
        isRam: true,
        index: 5
    },

    RAMX: {
        baseOffset: 0xA000,
        size: 0x2000,
        bankSize: 0x2000,
        maxBank: 7,
        isRam: true,
        isBanked: true,
        isZeroBanked: true,
        index: 6
    }

};

Section.SegmentNames = Object.keys(Section.Segments).sort();


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

        } else {
            if (entry instanceof Variable) {
                throw new TypeError('Variable can not be put in ROM segment');
            }
        }

        this.entries.push(entry);

    },

    addWithOffset: function(entry, offset) {

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

        } else {
            if (entry instanceof Variable) {
                throw new TypeError('Variable can not be put in ROM segment');
            }
        }

        this.entries.splice(offset, 0, entry);

    },

    calculateOffsets: function() {

        var offset = this.resolvedOffset,
            labelOffset = this.bankOffset,
            endOffset = this.endOffset;

        for(var i = 0, l = this.entries.length; i < l; i++) {

            var entry = this.entries[i];
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

        }

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
        if (this.baseOffset === null) {

            // If we're in bank 0 we just use the base offset
            if (this.bank === 0) {
                this.bankOffset = 0;
                this.baseOffset = segmentDefaults.baseOffset;

            // Otherwise we use the base offset + bank * bankSize
            // and also setup our bankOffset in order to correct label offsets
            } else {
                this.baseOffset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize;
                this.bankOffset = this.baseOffset - segmentDefaults.baseOffset;
            }

            // Caculate end of segment als data must lie in >= offset && <= endOffset
            this.startOffest = this.baseOffset;
            this.endOffset = this.baseOffset + segmentDefaults.size;

        // For sections with specified offsets we still need to correct for banking
        } else {

            if (this.bank === 0) {

                this.bankOffset = 0;
                this.endOffset = segmentDefaults.baseOffset + segmentDefaults.size;
                this.startOffest = segmentDefaults.baseOffset;

                if (this.baseOffset < segmentDefaults.baseOffset || this.baseOffset > this.endOffset) {
                    // TODO fix column index in error message
                    new Errors.AddressError(
                        this.file,
                        'Section offset out of range, must be between ' + segmentDefaults.baseOffset + ' and ' + this.endOffset,
                        this.nameIndex
                    );
                }

            } else {

                var baseBankOffset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize;
                this.endOffset = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize + segmentDefaults.size;
                this.bankOffset = this.baseOffset - segmentDefaults.baseOffset - (this.baseOffset - baseBankOffset);
                this.startOffest = segmentDefaults.baseOffset + (this.bank - 1) * segmentDefaults.bankSize;

                if (this.baseOffset < baseBankOffset || this.baseOffset > this.endOffset) {
                    // TODO fix column index in error message
                    new Errors.AddressError(
                        this.file,
                        'Section offset out of range, must be between ' + baseBankOffset + ' and ' + this.endOffset,
                        this.nameIndex
                    );
                }

            }

        }

        // Set initial resolved offset
        this.resolvedOffset = this.baseOffset;

        // Set storage flags
        this.isRam = segmentDefaults.isRam;

    },

    toString: function(resolved) {

        function rpad(value) {
            value = value.toString(16).toUpperCase();
            return (new Array(4 - value.length + 1).join('0')) + value;
        }

        if (resolved) {
            return this.name + ' in ' + this.segment + '[' + this.bank + '] at $'
                 + rpad(this.resolvedOffset) + '-$'
                 + rpad(this.resolvedOffset + this.size);

        } else {
            return this.name + ' in ' + this.segment + '[' + this.bank + '] at $'
                 + rpad(this.baseOffset - this.bankOffset) + '-$'
                 + rpad(this.baseOffset - this.bankOffset + this.size);
        }
    },

    toJSON: function() {

        var that = this;

        return {
            type: 'Section',
            file: this.file.name,
            name: this.name,
            segment: this.segment,
            bank: this.bank,
            start: this.startOffest,
            end: this.endOffset,
            offset: this.resolvedOffset,
            bankOffset: this.bankOffset,
            writeable: this.isRam,
            entries: this.entries.map(function(entry) {
                if (typeof entry.toJSON === 'function') {

                    var data = entry.toJSON();

                    // rewrite label offsets to be in ROM address space
                    if (data.type === 'Label') {
                        data.offset += that.bankOffset;
                    }

                    return data;

                } else {
                    return 0;
                }
            })
        };

    }

};


// Exports --------------------------------------------------------------------
module.exports = Section;

