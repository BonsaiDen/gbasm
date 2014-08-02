// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var troll = require('troll-opt'),
    fs = require('fs'),
    Compiler = require('./lib/Compiler');


// Command Line Interface------------------------------------------------------
// ----------------------------------------------------------------------------
var cmd = new troll.Troll();
var opts = cmd.options(function(troll) {

    troll.banner('A JavaScript Gameboy Assembler');
    troll.opt('outfile', 'The name of the output rom file', { short: 'o', default: 'game.gb' });
    troll.opt('mapfile', 'Name of the ROM mapping file to be generated', { short: 'm', default: '' });
    troll.opt('symfile', 'Name of the symbol map file to be generated', { short: 's', default: '' });
    troll.opt('silent', 'Do not produce any logging output', { short: 'S', default: false });
    troll.opt('optimize', 'Set optimization level', { short: 'O', default: 0 });
    troll.opt('warnings', 'Enable compiler warnings', { short: 'w', default: false });
    troll.opt('verbose', 'Turn on verbose logging', { short: 'v', default: false });
    troll.opt('version', 'Version information', { short: 'V', default: false });

});


var argv = cmd.argv();
if (argv.length) {

    // Compile
    var c = new Compiler(opts.silent);
    c.compile(argv);

    // Optimize
    if (opts.optimize > 0) {
        c.optimize(opts.optimize);
    }

    // Generate ROM image
    var rom = c.generate();
    if (opts.outfile === 'stdout') {
        process.stdout.write(rom);

    } else {
        fs.writeFileSync(opts.outfile, rom);
    }

    // Generate symbol file
    if (opts.symfile) {
        if (opts.symfile === 'stdout') {
            process.stdout.write(c.symbols(true));

        } else {
            fs.writeFileSync(opts.symfile, c.symbols(false));
        }
    }

    // Generate
    if (opts.mapfile) {
        if (opts.mapfile === 'stdout') {
            process.stdout.write(c.mapping(true));

        } else {
            fs.writeFileSync(opts.mapfile, c.mapping(false));
        }
    }


} else if (opts.version) {
    // Version Information
    var json = JSON.parse(fs.readFileSync('./package.json').toString());
    process.stdout.write(json.name + ' v' + json.version + '\n');


} else {
    // Usage
    cmd.usage();
}

