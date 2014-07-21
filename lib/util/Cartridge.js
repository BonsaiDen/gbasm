// Cartridge Information / Verification / Patching ----------------------------
// ----------------------------------------------------------------------------
var Cartridge = {

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
    },

    parseRomHeader: function(compiler, buffer) {

        var c = Cartridge;

        var info = {

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
            romChecksum: (buffer[0x14D] << 8) & buffer[0x14E]

        };


        // Validate logo
        for(var i = 0; i < c.NINTENDO_LOGO.length; i++) {
            if (c.NINTENDO_LOGO[i] !== info.logo[i]) {
                console.warn('Logo data in header is incorrect, fixing!');
                c.fixLogo(buffer);
                break;
            }
        }

        // Validate cartridge type
        if (c.TYPES.hasOwnProperty(info.type)) {
            info.type = c.TYPES[info.type];

        } else {
            throw new TypeError('Invalid Cartridge Type: ' + info.type);
        }

        // Validate ROM size
        if (c.ROM_SIZES.hasOwnProperty(info.rom)) {

            // Check if c type supports it
            if (c.ROM_SIZES[info.rom] > c.ROM_SIZES[c.MAX_ROM_SIZE[info.type.Mapper]][0])  {
                throw new TypeError('ROM size exceeds size supported by mapper');

            } else {
                info.rom = {
                    size: c.ROM_SIZES[info.rom][0] * 1024,
                    banks: c.ROM_SIZES[info.rom][1]
                };
            }

        } else {
            throw new TypeError('Invalid ROM size: ' + info.type);
        }

        // Validate RAM size
        if (c.RAM_SIZES.hasOwnProperty(info.ram)) {

            // Check if c type supports it
            if (c.RAM_SIZES[info.ram] > c.RAM_SIZES[c.MAX_RAM_SIZE[info.type.Mapper]][0])  {
                throw new TypeError('RAM size exceeds size supported by mapper');

            } else {
                info.ram = {
                    size: c.RAM_SIZES[info.ram][0] * 1024,
                    banks: c.RAM_SIZES[info.ram][1]
                };
            }

        } else {
            throw new TypeError('Invalid RAM size: ' + info.type);
        }

        // TODO Validate country code


        // Set Checksums
        c.calculateCheckums(buffer);

        // Checksums
        info.headerChecksum = buffer[0x14D];
        info.romChecksum = (buffer[0x14D] << 8) & buffer[0x14E];

        return info;

    },

    fixLogo: function() {

    },

    calculateCheckums: function(buffer) {

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
module.exports = Cartridge;

