// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var fs = require('fs'),
    Compiler = require('./lib/Compiler');


// Command Line Interface------------------------------------------------------
// ----------------------------------------------------------------------------
var args = process.argv.slice(2),
    options = {
        outfile: 'game.gb',
        optimize: false,
        mapfile: null,
        symfile: null,
        silent: false,
        version: false,
        verbose: false,
        help: false,
        files: []
    };

for(var i = 0, l = args.length; i < l; i++) {
    var arg = args[i];
    switch(arg) {
        case '-o':
        case '--outfile':
            options.outfile = getString(arg, args, ++i);
            break;

        case '-O':
        case '--optimize':
            options.optimize = true;
            break;

        case '-m':
        case '--mapfile':
            options.mapfile = getString(arg, args, ++i);
            break;

        case '-s':
        case '--symfile':
            options.symfile = getString(arg, args, ++i);
            break;

        case '-S':
        case '--silent':
            options.silent = true;
            break;

        case '--version':
            options.version = true;
            break;

        case '-v':
        case '--verbose':
            options.verbose = true;
            break;

        case '--help':
            options.help = true;
            break;

        default:
            if (arg.substring(0, 1) === '-') {
                error('Unknown option: ' + arg);

            } else {
                options.files.push(arg);
            }
            break;

    }
}

// Version Information
if (options.version) {
    process.stdout.write('v0.0.5\n');

} else if (options.help) {
    usage();

// Compile Files
} else if (options.files.length) {

    // Compile
    var c = new Compiler(options.silent);
    c.compile(options.files);

    // Optimize
    if (options.optimize) {
        c.optimize();
    }

    // Generate ROM image
    var rom = c.generate();
    if (options.outfile === 'stdout') {
        process.stdout.write(rom);

    } else {
        fs.writeFileSync(options.outfile, rom);
    }

    // Generate symbol file
    if (options.symfile) {
        if (options.symfile === 'stdout') {
            process.stdout.write(c.symbols(true));

        } else {
            fs.writeFileSync(options.symfile, c.symbols(false));
        }
    }

    // Generate
    if (options.mapfile) {
        if (options.mapfile === 'stdout') {
            process.stdout.write(c.mapping(true));

        } else {
            fs.writeFileSync(options.mapfile, c.mapping(false));
        }
    }


// Usage
} else {
    usage();
}


// Helpers --------------------------------------------------------------------
function getString(name, args, index) {

    var s = args[index];
    if (s === undefined || s.substring(0, 1) === '-') {
        error('Expected string argument for ' + name);

    } else {
        return s;
    }

}

function usage() {
    process.stdout.write([
        'Usage: gbasm [options] [sources]',
        '',
        '   --outfile, -o <s>: The name of the output rom file (default: game.gb)',
        '      --optimize, -O: Enable instruction optimizations',
        '   --mapfile, -m <s>: Name of the ROM mapping file to be generated',
        '   --symfile, -s <s>: Name of the symbol map file to be generated ',
        '        --silent, -S: Do not produce any logging output ',
        '       --verbose, -v: Turn on verbose logging ',
        '       --version, -V: Display version information ',
        '              --help: Display this help text'
    ].join('\n') + '\n');
}

function error(message) {
    process.stdout.write('Error: ' + message + '\n');
    process.exit(1);
}

