// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
const fs = require('fs'),
    path = require('path'),
    Compiler = require('./lib/Compiler');


// Command Line Interface------------------------------------------------------
// ----------------------------------------------------------------------------
const args = process.argv.slice(2),
    options = {
        outfile: 'game.gb',
        optimize: false,
        mapfile: null,
        symfile: null,
        jsonfile: null,
        unused: false,
        unsafe: false,
        silent: false,
        version: false,
        verbose: false,
        info: false,
        help: false,
        files: []
    };

for(let i = 0, l = args.length; i < l; i++) {
    const arg = args[i];
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

        case '--info':
            options.info = getString(arg, args, ++i);
            break;

        case '-S':
        case '--silent':
            options.silent = true;
            break;

        case '-j':
        case '--jsonfile':
            options.jsonfile = getString(arg, args, ++i);
            break;

        case '--unused':
            options.unused = true;
            break;

        case '--unsafe':
            options.unsafe = true;
            break;

        case '--version':
            options.version = true;
            break;

        case '-v':
        case '--verbose':
            options.verbose = true;
            break;

        case '-d':
        case '--debug':
            options.debug = true;
            break;

        case '--help':
            options.help = true;
            break;

        default:
            if (arg.substring(0, 1) === '-') {
                error(`Unknown option: ${arg}`);

            } else {
                options.files.push(arg);
            }
            break;

    }
}

// Version Information
if (options.version) {

    const p = path.join(__dirname, 'package.json'),
        version = JSON.parse(fs.readFileSync(p).toString()).version;

    process.stdout.write(`v${version}\n`);

// Display Help
} else if (options.help) {
    usage();

// Source String Information
} else if (options.info !== false) {
    process.stdout.write(Compiler.infoFromSource(options.info));

// Compile Files
} else if (options.files.length) {

    // Compile
    const c = new Compiler(options.silent, options.verbose, options.debug);
    c.compile(options.files, !options.optimize);

    // Optimize
    if (options.optimize) {
        c.optimize(options.unsafe);
    }

    // Report unused labels and variables
    if (options.unused) {
        c.unused();
    }

    // Generate ROM image
    if (options.outfile === 'stdout') {
        process.stdout.write(c.generate());

    } else {
        fs.writeFileSync(options.outfile, c.generate());
    }

    // Generate symbol file
    if (options.symfile) {
        if (options.symfile === 'stdout') {
            process.stdout.write(c.symbols(true));

        } else {
            fs.writeFileSync(options.symfile, c.symbols(false));
        }
    }

    // Generate mapping file
    if (options.mapfile) {
        if (options.mapfile === 'stdout') {
            process.stdout.write(c.mapping(true));

        } else {
            fs.writeFileSync(options.mapfile, c.mapping(false));
        }
    }

    // Generate json dump file
    if (options.jsonfile) {
        if (options.jsonfile === 'stdout') {
            process.stdout.write(c.json());

        } else {
            fs.writeFileSync(options.jsonfile, c.json());
        }
    }

// Usage
} else {
    usage();
}


// Helpers --------------------------------------------------------------------
function getString(name, args, index) {
    const s = args[index];
    if (s === undefined || s.substring(0, 1) === '-') {
        error(`Expected string argument for ${name}`);

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
        '            --unsafe: Turn on unsafe optimizations',
        '   --mapfile, -m <s>: Generates a ASCII overview of the mapped ROM space',
        '   --symfile, -s <s>: Generates a symbol map compatible with debuggers',
        '  --jsonfile, -j <s>: Generates a JSON data dump of all sections with their data, labels, instructions etc.',
        '        --silent, -S: Surpresses all logging',
        '         --debug, -d: Enable support for custom "msg" and "brk" debug opcodes for use with BGB',
        '            --unused: Report unused labels and variables',
        '          --info <s>: Parse the input string and return byte count and cycles information',
        '       --verbose, -v: Turn on verbose logging',
        '           --version: Displays version information',
        '              --help: Displays this help text',
        ''
    ].join('\n'));
}

function error(message) {
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
}

