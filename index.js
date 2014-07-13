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

var c = new Compiler(),
    argv = troll.argv();

// Mode -----------------------------------------------------------------------
if (argv.length) {

    console.log(opts);

    c.compile(argv);
    c.link();

    var a = c.generate();
    //c.optimize();

    var b = c.generate();
    //console.log(c.symbols());
    console.log(a.slice(0x200));
    console.log(b.slice(0x200));
    fs.writeFileSync(opts.outfile, a);

    if (opts.symfile) {
        var symbols = c.symbols();
        //console.log(symbols);
        fs.writeFileSync(opts.symfile, symbols);
    }

    // TODO generate list map and symfiles
    // TODO respect silent flag
    // TODO implement additional compiler warnings

}

