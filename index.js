// Dependencies ---------------------------------------------------------------
// ----------------------------------------------------------------------------
var Troll = require('troll-opt').Troll,
    fs = require('fs'),
    Compiler = require('./lib/Compiler');


// Command Line Interface------------------------------------------------------
// ----------------------------------------------------------------------------
var troll = new Troll();
var opts = troll.options(function(troll) {

    troll.banner('A modern Gameboy Assembler');

    troll.opt('outfile', 'The name of the output rom file', { short: 'o', default: 'game.gb' });
    troll.opt('listfile', 'Name of the assembly listing file to be generated', { short: 'l' });
    troll.opt('mapfile', 'Name of the ROM mapping file to be generated', { short: 'm' });
    troll.opt('symfile', 'Name of the symbol map file to be generated', { short: 's', default: '' });
    troll.opt('stdout', 'Write any output to standard out instead of a file', { default: false });
    troll.opt('silent', 'Do not produce any logging output', { short: 'S', default: false });
    troll.opt('warnings', 'Enable compiler warnings', { short: 'w', default: false });
    troll.opt('verbose', 'Turn on verbose logging', { short: 'v', default: false });
    troll.opt('version', 'Version information', { short: 'V', default: false });

});

var argv = troll.argv();


// Mode -----------------------------------------------------------------------
if (argv.length) {

    var c = new Compiler();
    c.compile(argv);

    //c.optimize();

    fs.writeFileSync(opts.outfile, c.generate());

    if (opts.symfile) {
        fs.writeFileSync(opts.symfile, c.symbols());
    }

    // TODO generate list map and symfiles
    // TODO respect silent flag
    // TODO respect stdout flag
    // TODO implement additional compiler warnings

}

