// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var path = require('path'),
    Linker = require('./linker/Linker'),
    Generator = require('./Generator'),
    SourceFile = require('./SourceFile');

require('colors');


// Assembly Code Compiler -----------------------------------------------------
// ----------------------------------------------------------------------------
function Compiler(silent, verbose, debug) {
    this.files = [];
    this.context = null;
    this.base = '';
    this.silent = !!silent;
    this.verbose = !!verbose;
    this.debug = !!debug;
}


// Statics --------------------------------------------------------------------
Compiler.infoFromSource = function(source) {

    var c = new Compiler(false, false),
        file = new SourceFile(
            c,
            null,
            new Buffer('SECTION "Memory",ROM0\n' + source + '\n'),
            null,
            0
        ),
        opCycles = 0,
        opBytes = 0,
        dataBytes = 0;

    file.parse();

    file.instructions.forEach(function(i) {
        opCycles += i.cycles;
        opBytes += i.size;
    });

    file.dataBlocks.forEach(function(d) {
        dataBytes += d.size;
    });

    return opCycles + ' cycles, ' + (opBytes + dataBytes)
         + ' bytes (' + opBytes + ' ops, ' + dataBytes + ' data)';

};


// Methods --------------------------------------------------------------------
Compiler.prototype = {

    // API --------------------------------------------------------------------
    compile: function(files, verify) {

        // Set base path from first file to be included
        this.base = path.join(process.cwd(), path.dirname(files[0]));
        this.files.length = 0;

        // Parse and link
        this.parse(files);
        this.link(verify);

    },

    optimize: function(unsafe) {
        Linker.optimize(this.files, unsafe);
    },

    generate: function() {

        var that = this,
            start = Date.now(),
            rom = Generator.generateRom(this.files);

        if (rom.errors.length) {
            rom.errors.forEach(function(error) {

                if (error === Generator.Errors.INVALID_ROM_SIZE) {
                    that.error(null, 'Invalid ROM size specified in ROM header');

                } else if (error === Generator.Errors.INVALID_RAM_SIZE) {
                    that.error(null, 'Invalid RAM size specified in ROM header');

                } else if (error === Generator.Errors.INVALID_CARTRIDGE_TYPE) {
                    that.error(null, 'Invalid cartridge type size specified in ROM header');

                } else if (error === Generator.Errors.MAPPER_UNSUPPORTED_RAM_SIZE) {
                    that.error(null, 'Mapper set in ROM header does not support the RAM size specified in the ROM header');

                } else if (error === Generator.Errors.MAPPER_UNSUPPORTED_ROM_SIZE) {
                    that.error(null, 'Mapper set in ROM header does not support the ROM size specified in the ROM header');
                }

            });

        } else if (rom.warnings.length) {
            rom.warnings.forEach(function(warning) {

                if (warning === Generator.Warnings.ROM_IS_PADDED) {
                    that.warning(null, 0, 'Generated ROM image is bigger than the ROM size that was specified in the ROM header');

                } else if (warning === Generator.Warnings.HEADER_SIZE_TOO_SMALL) {
                    that.warning(null, 0, 'ROM size in header is smaller then the minimum required size for the generated ROM (automatically extended)');

                } else if (warning === Generator.Warnings.INVALID_LOGO_DATA) {
                    that.warning(null, 0, 'ROM contains invalid logo data (automatically patched to contain the correct values)');
                }

            });
        }

        // Reporting
        if (this.verbose) {
            this.log(null, 'Generated rom in ' + (Date.now() - start) + 'ms');
        }

        this.log(null, 'Title: ' + rom.title);
        this.log(null, 'Mapper: ' + rom.type.Mapper);

        if (rom.rom.size > 32768) {
            this.log(null, 'ROM: ' + rom.rom.size + ' bytes ( ' + (rom.rom.size) + ' bytes in ' + rom.rom.banks + ' bank(s) )');

        } else {
            this.log(null, 'ROM: ' + rom.rom.size + ' bytes ( standard ROM only, 32768 bytes )');
        }

        if (rom.ram.size > 0) {
            this.log(null, 'RAM: ' + (rom.ram.size + 8192) + ' bytes ( internal 8192 bytes, ' + (rom.ram.size) + ' bytes in ' + rom.ram.banks + ' bank(s) )');

        } else if (rom.ram.size) {
            this.log(null, 'RAM: ' + (rom.ram.size + 8192) + ' bytes ( internal RAM only, 8192 bytes )');
        }

        this.log(null, 'BATTERY: ' + (rom.type.Battery ? 'Yes' : 'None'));
        process.stdout.write('\n');

        return rom.buffer;

    },

    json: function() {
        return JSON.stringify(Linker.getAllSections(this.files).map(function(l) {
            return l.toJSON();

        }), null, '   ');
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

    unused: function() {

        var that = this;
        this.files.forEach(function(f) {

            f.labels.filter(function(l) {
                return l.references === 0;

            }).map(function(f) {
                that.warning(f.file, f.index, 'Unused label: ' + f.name);
            });

            f.variables.filter(function(v) {
                return v.references === 0;

            }).map(function(v) {
                that.warning(v.file, v.index, 'Unused variable: ' + v.name);
            });

        });

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

        Linker.getAllSections(this.files).map(function(s) {

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

            var usage = [],
                first = segment.usage[0];

            if (first[0] > segment.start) {
                usage.push(row(0, first[0] - 1, first[0], false));
            }

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


    // Internals --------------------------------------------------------------
    includeFile: function(parent, file, section, index) {
        var sourceFile = new SourceFile(this, parent, file, section, index);
        this.files.push(sourceFile);
        sourceFile.parse(this.debug);
        return sourceFile;
    },

    parse: function(files) {

        var that = this,
            start = Date.now();

        files.forEach(function(file) {
            that.includeFile(null, path.join(process.cwd(), file), 0, null, 0, 0);
        });

        this.verbose && this.log(null, 'Parsed ' + this.files.length + ' file(s) in ' + (Date.now() - start) + 'ms');

    },

    link: function(verify) {
        var start = Date.now();
        Linker.init(this.files);
        Linker.link(this.files, verify);
        this.verbose && this.log(null, 'Linked ' + this.files.length + ' file(s) in ' + (Date.now() - start) + 'ms');
    },


    // Error Handling and Logging ---------------------------------------------
    error: function(file, error) {

        if (!this.silent) {
            if (file) {
                process.stderr.write(
                    '\n'
                    + file.getLineSource(error.index).source
                    + '\n\n'
                    + (error.name + ': ').red
                    + error.message
                    + '\n' +  ('    at ' + file.getPath(error.index)).yellow + '\n\n'
                );

            } else {
                process.stderr.write('[error]'.red + ' ' + error.red + '\n');
            }
        }

        process.exit(1);

    },

    warning: function(file, index, message) {
        if (!this.silent) {
            if (file) {
                process.stdout.write(
                    message
                    + '\n' +  ('    at ' + file.getPath(index)).yellow + '\n\n'
                );

            } else {
                process.stdout.write('[warning]'.yellow + ' ' + message.grey + '\n');
            }
        }
    },

    log: function(file, message) {

        file = file ? file.getPath(undefined, undefined, true): '[gbasm]';

        if (!this.silent) {
            process.stdout.write(file.blue + ' ' + message + '\n');
        }

    }

};


// Helpers --------------------------------------------------------------------
function padHexValue(value, size, pad) {
    var s = value.toString(16).toUpperCase();
    return new Array((size + 1) - s.length).join(pad) + s;
}


// Exports --------------------------------------------------------------------
module.exports = Compiler;

