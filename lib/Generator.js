// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------


// ROM Generation Logic -------------------------------------------------------
// ----------------------------------------------------------------------------
var Generator = {

    // Static Methods ---------------------------------------------------------
    generateRom: function(files) {

        // Generate code and data for all files
        var buffer = Generator.getRomBuffer(files);
        files.forEach(function(file) {
            Generator.generateFile(file, buffer);
        });

        // Pad if ROM size in header is bigger than generated buffer
        var rom = Generator.parseRom(buffer);
        if (rom.rom.size > buffer.length) {
            buffer = Generator.padRomBuffer(buffer, rom.rom.size);
            rom.warnings.push(Generator.Warnings.ROM_IS_PADDED);

        // Warn if generated buffer is bigger than the specified header size
        } else if (buffer.length > rom.rom.size) {
            rom.warnings.push(Generator.Warnings.HEADER_SIZE_TOO_SMALL);
        }

        rom.buffer = buffer;

        return rom;

    },

    generateFile: function(file, buffer) {

        // Write instructions to ROM
        file.instructions.forEach(function(instr) {

            var index = instr.offset;
            for(var i = 0; i < instr.raw.length; i++) {
                buffer[index++] = instr.raw[i];
            }

            // Write arguments
            if (instr.resolvedArg) {
                if (instr.bits === 8) {
                    buffer[index] = instr.resolvedArg;

                } else if (instr.bits === 16) {
                    buffer[index] = instr.resolvedArg & 0xff;
                    buffer[index + 1] = (instr.resolvedArg >> 8) & 0xff;
                }
            }

        });

        // Write data blocks to ROM
        file.dataBlocks.forEach(function(data) {

            var index = data.offset, i;

            // Empty DS
            if (data.size > data.resolvedValues.length * (data.bits / 8)) {
                for(i = 0; i < data.size; i++) {
                    buffer[index++] = 0;
                }

            // DB / DS
            } else if (data.bits === 8) {
                for(i = 0; i < data.resolvedValues.length; i++) {
                    buffer[index++] = data.resolvedValues[i];
                }

            // DW
            } else if (data.bits === 16) {
                for(i = 0; i < data.resolvedValues.length; i++) {
                    buffer[index++] = data.resolvedValues[i] & 0xff;
                    buffer[index++] = (data.resolvedValues[i] >> 8) & 0xff;
                }
            }

        });

        // Copy binary includes to ROM
        file.binaryIncludes.forEach(function(binary) {
            binary.getBuffer().copy(buffer, binary.offset);
        });

    },


    // Size Calculation -------------------------------------------------------
    getRomBuffer: function(files) {
        var buffer = new Buffer(Generator.getRequiredRomSize(files));
        for(var i = 0; i < buffer.length; i++) {
            buffer[i] = 0;
        }
        return buffer;
    },

    getPaddedRomBuffer: function(buffer, size) {

        var paddingSize = size - buffer.length,
            paddingBuffer = new Buffer(paddingSize);

        for(var i = 0; i < paddingSize; i++) {
            paddingBuffer[i] = 0;
        }

        return Buffer.concat([buffer, paddingBuffer]);

    },

    getRequiredRomSize: function(files) {
        return files.map(Generator.getRequiredFileSize).sort(function(a, b) {
            return b - a;

        })[0] || 0x8000; // Minimum ROM size is 32kbyte
    },

    getRequiredFileSize: function(file) {

        var v = file.sections.filter(function(s) {
            return s.segment === 'ROM0' || s.segment === 'ROMX';

        }).map(function(s) {
            return Math.floor(s.offset / 0x4000);

        }).sort(function(a, b) {
            return b - a;

        })[0] || 1;

        // Get nearest upper power of two
        v |= v >> 1;
        v |= v >> 2;
        v |= v >> 4;
        v |= v >> 8;
        v |= v >> 16;
        v++;

        // Returns 32kb, 64kb, 128kb, 256kb etc.
        return v * 0x4000;

    },


    // ROM Handling -----------------------------------------------------------
    parseRom: function(buffer) {

        var rom = Generator.getRomInfo(buffer),
            g = Generator;

        // Validate logo
        for(var i = 0; i < g.NINTENDO_LOGO.length; i++) {
            if (g.NINTENDO_LOGO[i] !== rom.logo[i]) {
                rom.warnings.push(Generator.INVALID_LOGO_DATA);
                Generator.fixLogo(buffer);
                break;
            }
        }

        // Validate cartridge type
        if (g.TYPES.hasOwnProperty(rom.type)) {
            rom.type = g.TYPES[rom.type];

        } else {
            rom.errors.push(Generator.Errors.INVALID_CARTRIDGE_TYPE);
            return rom;
        }

        // Validate ROM size
        if (g.ROM_SIZES.hasOwnProperty(rom.rom)) {

            // Check if cartridge type supports it
            if (g.ROM_SIZES[rom.rom] > g.ROM_SIZES[g.MAX_ROM_SIZE[rom.type.Mapper]][0])  {
                rom.errors.push(Generator.Errors.MAPPER_UNSUPPORTED_ROM_SIZE);
                return rom;

            } else {
                rom.rom = {
                    size: g.ROM_SIZES[rom.rom][0] * 1024,
                    banks: g.ROM_SIZES[rom.rom][1]
                };
            }

        } else {
            rom.errors.push(Generator.Errors.INVALID_ROM_SIZE);
            return rom;
        }

        // Validate RAM size
        if (g.RAM_SIZES.hasOwnProperty(rom.ram)) {

            // Check if cartridge type supports it
            if (g.RAM_SIZES[rom.ram] > g.RAM_SIZES[g.MAX_RAM_SIZE[rom.type.Mapper]][0])  {
                rom.errors.push(Generator.Errors.MAPPER_UNSUPPORTED_RAM_SIZE);
                return rom;

            } else {
                rom.ram = {
                    size: g.RAM_SIZES[rom.ram][0] * 1024,
                    banks: g.RAM_SIZES[rom.ram][1]
                };
            }

        } else {
            rom.errors.push(Generator.Errors.INVALID_RAM_SIZE);
            return rom;
        }

        // TODO Validate country code


        // Set Checksums
        Generator.setRomChecksums(buffer);

        // Checksums
        rom.headerChecksum = buffer[0x14D];
        rom.romChecksum = (buffer[0x14D] << 8) & buffer[0x14E];

        return rom;

    },

    getRomInfo: function(buffer) {
        return {

            // General
            logo: buffer.slice(0x104, 0x134),
            title: buffer.slice(0x134, 0x143).toString('ascii'),
            colorGameBoyFlag: buffer[0x143],

            // Super Gameboy related
            sgbLicenseeCode: (buffer[0x144] << 8) & buffer[0x145],
            sgbFlag: buffer[0x146],

            // Cartrige info
            type: buffer[0x147],
            rom: buffer[0x148],
            ram: buffer[0x149],
            countryCode: buffer[0x14A],
            licenseeCode: buffer[0x14B], // 33 = super gameboy, will use the code from above
            versionNumber: buffer[0x14C],

            // Checksums
            headerChecksum: buffer[0x14D],
            romChecksum: (buffer[0x14D] << 8) & buffer[0x14E],

            // Warning and Errors generated
            warnings: [],
            errors: []

        };
    },

    setRomChecksums: function(buffer) {

        // Header
        var checksum = 0, i;
        for(i = 0x134; i < 0x14D; i++) {
            checksum = (((checksum - buffer[i]) & 0xff) - 1) & 0xff;
        }

        buffer[0x14D] = checksum;

        // ROM
        checksum = 0;
        for(i = 0; i < buffer.length; i++) {
            if (i !== 0x14E && i !== 0x14F) {
                checksum += buffer[i];
            }
        }

        buffer[0x14E] = (checksum >> 8) & 0xff;
        buffer[0x14F] = checksum & 0xff;

    },

    // Error and Warning Constants --------------------------------------------
    Warnings: {
        ROM_IS_PADDED: 1,
        HEADER_SIZE_TOO_SMALL: 2,
        INVALID_LOGO_DATA: 3
    },

    Errors: {
        INVALID_ROM_SIZE: 1,
        INVALID_RAM_SIZE: 2,
        INVALID_CARTRIDGE_TYPE: 3,
        MAPPER_UNSUPPORTED_RAM_SIZE: 4,
        MAPPER_UNSUPPORTED_ROM_SIZE: 5
    },


    // ROM Constants ----------------------------------------------------------
    // ------------------------------------------------------------------------
    TYPES: {
        0x00: cartridgeType('ROM'),
        0x01: cartridgeType('MBC1'),
        0x02: cartridgeType('MBC1+RAM'),
        0x03: cartridgeType('MBC1+RAM+BATTERY'),
        0x05: cartridgeType('MBC2'),
        0x06: cartridgeType('MBC2+BATTERY'),
        0x08: cartridgeType('ROM+RAM'),
        0x09: cartridgeType('ROM+RAM+BATTERY'),
        0x0B: cartridgeType('MMM01'),
        0x0C: cartridgeType('MMM01+RAM'),
        0x0D: cartridgeType('MMM01+RAM+BATTERY'),
        0x0F: cartridgeType('MBC3+TIMER+BATTERY'),
        0x10: cartridgeType('MBC3+TIMER+RAM+BATTERY'),
        0x11: cartridgeType('MBC3'),
        0x12: cartridgeType('MBC3+RAM'),
        0x13: cartridgeType('MBC3+RAM+BATTERY'),
        0x15: cartridgeType('MBC4'),
        0x16: cartridgeType('MBC4+RAM'),
        0x17: cartridgeType('MBC4+RAM+BATTERY'),
        0x19: cartridgeType('MBC5'),
        0x1A: cartridgeType('MBC5+RAM'),
        0x1B: cartridgeType('MBC5+RAM+BATTERY'),
        0x1C: cartridgeType('MBC5+RUMBLE'),
        0x1D: cartridgeType('MBC5+RUMBLE+RAM'),
        0x1E: cartridgeType('MBC5+RUMBLE+RAM+BATTERY'),
        0xFC: cartridgeType('ROM+POCKET CAMERA'),
        0xFD: cartridgeType('ROM+BANDAI TAMA5'),
        0xFE: cartridgeType('HuC3'),
        0xFF: cartridgeType('HuC1+RAM+BATTERY')
    },

    NINTENDO_LOGO: [
        0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
        0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
        0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
        0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
        0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
        0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E
    ],

    ROM_SIZES: {
        0x00: [  32,   0],
        0x01: [  64,   4],
        0x02: [ 128,   8],
        0x03: [ 256,  16],
        0x04: [ 512,  32],
        0x05: [1024,  64], // Only 63 banks used by MBC1
        0x06: [2048, 128], // Only 125 banks used by MBC1
        0x07: [4096, 256],
        0x52: [1152,  72],
        0x53: [1280,  80],
        0x54: [1536,  96]
    },

    RAM_SIZES: {
        0x00: [ 0, 0],  // None (must always be set with MBC2 even though it has 512x4 bits RAM)
        0x01: [ 2, 1],  // 1 Bank (only one quarter is used)
        0x02: [ 8, 1],  // 1 Bank (Full)
        0x03: [32, 4] // 4 Banks
    },

    MAX_ROM_SIZE: {
        ROM:  0x00,
        MBC1: 0x06,
        MBC2: 0x03,
        MBC3: 0x06,
        MBC4: 0xFF, // ???
        MBC5: 0x07
    },

    MAX_RAM_SIZE: {
        ROM:  0x00,
        MBC1: 0x03,
        MBC2: 0x00, // 512x4 bits RAM built into the MBC2 chip, only the lower 4 bits can be read
        MBC3: 0x03,
        MBC4: 0xFF, // ???
        MBC5: 0x03
    },

    DESTINATION: {
        0x00: 'Japanese',
        0x01: 'Non-Japanese'
    },

    LICENSEES: {
        0x33: 'Super Gameboy',
        0x79: 'Accolade',
        0xA4: 'Konami'
    }

};


// Helper ---------------------------------------------------------------------
function cartridgeType(ident) {
    return {
        Mapper: ident.split('+')[0],
        Ram: ident.indexOf('RAM') !== -1,
        Battery: ident.indexOf('BATTERY') !== -1,
        Timer: ident.indexOf('TIMER') !== -1,
        Rumble: ident.indexOf('RUMBLE') !== -1,
        Camera: ident === 'ROM+POCKET CAMERA',
        BandaiTama: ident === 'ROM+BANDAI TAMA5',
    };
}


// Exports --------------------------------------------------------------------
module.exports = Generator;

