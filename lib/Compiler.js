// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var path = require('path'),
    Linker = require('./linker/Linker'),
    Cartridge = require('./util/Cartridge'),
    SourceFile = require('./SourceFile');

require('colors');


// Assembly Code Compiler -----------------------------------------------------
// ----------------------------------------------------------------------------
function Compiler() {
    this.files = [];
    this.context = null;
    this.base = '';
}

Compiler.prototype = {

    // API --------------------------------------------------------------------
    compile: function(files, silent) {

        var that = this,
            start = Date.now();

        this.files.length = 0;
        this.base = path.join(process.cwd(), path.dirname(files[0]));

        Linker.reset();

        files.forEach(function(file) {
            that.includeFile(null, path.join(process.cwd(), file), 0, null, 0, 0);
        });

        this.log(null, 'Parsed ' + this.files.length + ' file(s) in ' + (Date.now() - start) + 'ms');
        this.link(true);

        this.log(null, 'Linked ' + this.files.length + ' file(s) in ' + (Date.now() - start) + 'ms');

        Linker.init(this.files);

    },

    includeFile: function(parent, file, section, index) {
        var sourceFile = new SourceFile(this, parent, file, section, index);
        this.files.push(sourceFile);
        sourceFile.parse();
        return sourceFile;
    },

    link: function() {
        Linker.link(this.files);
    },

    optimize: function() {
        Linker.optimize(this.files);
    },

    generate: function() {

        var size = this.getMinimumRomSize(),
            buffer = new Buffer(size),
            header;

        // Clear all bytes in the rom
        for(var i = 0; i < size; i++) {
            buffer[i] = 0;
        }

        // Generate Code and Data
        this.files.forEach(function(file) {
            file.generate(buffer);
        });

        // Get Cartridge Informatio and Validate
        header = Cartridge.parseRomHeader(this, buffer);

        // Pad if ROM size in header is bigger than required size
        if (header.rom.size > size) {

            this.log(null, 'Generated ROM is smaller than size specified in header, padding.');

            var paddingSize = header.rom.size - size,
                paddingBuffer = new Buffer(paddingSize);

            for(i = 0; i < paddingSize; i++) {
                paddingBuffer[i] = 0;
            }

            buffer = Buffer.concat([buffer, paddingBuffer]);

        } else if (size > header.rom.size) {
            this.warning(null, 'ROM size in header is smaller then the required size to generate.');
        }

        this.log(null,  'Title: ' + header.title);
        this.log(null,  'Mapper: ' + header.type.Mapper);
        this.log(null,  'ROM: ' + header.rom.size + ' bytes in ' + header.rom.banks + ' bank(s)');
        this.log(null,  'RAM: ' + header.ram.size + ' bytes in ' + header.ram.banks + ' bank(s)');
        this.log(null,  'BATTERY: ' + (header.type.Battery ? 'yes' : 'no'));

        return buffer;

    },

    symbols: function() {

        var symbols = [];

        this.files.forEach(function(file) {
            symbols.push.apply(symbols, file.symbols());
        });

        symbols.sort(function(a, b) {
            return a.offset - b.offset;
        });

        return symbols.map(function(s) {
            var name = s.parent ? s.parent.name + s.name : s.name;
            return padHexValue(s.section.bank, 2, '0') + ':' + padHexValue(s.offset, 4, '0') + ' ' + name;

        }).join('\n');

    },

    mapping: function() {

        function pad(value, size, ch) {
            return value + (new Array(size - value.length + 1).join(ch));
        }

        function rpad(value, size, ch) {
            return (new Array(size - value.length + 1).join(ch)) + value;
        }

        function row(from, to, free, used, name) {

            from = '$' + rpad(from.toString(16), 4, '0');
            to = '$' + rpad(to.toString(16), 4, '0');
            free = '(' + rpad(free.toString(), 5, ' ') + ' bytes)';

            if (used) {
                return '    - ' + from + '-' + to + ' ######## ' + free + ' (' + name + ')';

            } else {
                return ('    - ' + from + '-' + to + ' ........ ' + free).grey;
            }

        }

        var segmentMap = {},
            segmentList = [];

        this.getSections().map(function(s) {

            var id = s.segment + '_' + s.bank;
            if (!segmentMap.hasOwnProperty(id)) {
                segmentMap[id] = {
                    start: s.startOffest - s.bankOffset,
                    end: s.endOffset - s.bankOffset,
                    name: s.segment,
                    bank: s.bank,
                    size: s.endOffset - s.startOffest,
                    used: s.size,
                    usage: [[s.resolvedOffset - s.bankOffset, s.size, s.name]]
                };

                segmentList.push(segmentMap[id]);

            } else {
                segmentMap[id].used += s.size;
                segmentMap[id].usage.push([s.resolvedOffset - s.bankOffset, s.size, s.name]);
                segmentMap[id].usage.sort(function(a, b) {
                    return a[0] - b[0];
                });
            }

        });

        segmentList.sort(function(a, b) {
            if (a.start === b.start) {
                return a.bank - b.bank;

            } else {
                return a.start - b.start;
            }
        });

        var map = segmentList.map(function(segment) {

            var usage = [];
            segment.usage.forEach(function(u, index) {

                var next = segment.usage[index + 1];
                usage.push(row(u[0], u[0] + u[1] - 1, u[1], true, u[2]));

                if (next && next[0] > u[0] + u[1]) {
                    usage.push(row(u[0] + u[1], next[0] - 1, next[0] - (u[0] + u[1]), false));
                }

            });

            var last = segment.usage[segment.usage.length - 1];
            if (last[0] + last[1] < segment.end) {
                usage.push(row(last[0] + last[1], segment.end - 1, segment.end - (last[0] + last[1]), false));
            }

            var header;
            if (segment.bank) {
                header = pad(segment.name + '[' + segment.bank + ']', 10, ' ');

            } else {
                header = pad(segment.name, 10, ' ');
            }

            return ('  '
                + header + ' @ $'
                + rpad(segment.start.toString(16), 4, '0')
                + ' (' + rpad(segment.used.toString(), 5, ' ')
                + ' of ' + rpad(segment.size.toString(), 5, ' ')
                + ' bytes used)'
                + ' ( ' + rpad((segment.size - segment.used).toString(), 5, ' ')
                + ' free)').cyan + '\n\n' + usage.join('\n') + '\n\n';

        });

        return map.join('\n');

    },


    // Getters ----------------------------------------------------------------
    getMinimumRomSize: function() {

        return this.files.map(function(file) {
            return file.getMinimumRomSize();

        }).sort(function(a, b) {
            return b - a;

        })[0] || 0x8000; // Minimum ROM size is 32kbyte

    },


    // Error Handling and Logging ---------------------------------------------
    error: function(file, index, message) {
        console.error(message.red + '\n' +  ('    at ' + file.getPath(index)).yellow + '\n\n');
        process.exit(1);
    },

    warning: function(file, index, message) {
        file = file ? file.getPath(index, true).orange : '[Warning]';
        console.warn(file.getPath().orange + ' ' + message.yellow);
    },

    log: function(file, message) {
        file = file ? file.getPath(undefined, undefined, true): '[Info]';
        console.log(file.blue, message);
    }

};


// Helpers --------------------------------------------------------------------
function padHexValue(value, size, pad) {
    var s = value.toString(16).toUpperCase();
    return new Array((size + 1) - s.length).join(pad) + s;
}


// Exports --------------------------------------------------------------------
module.exports = Compiler;

