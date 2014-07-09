var fs = require('fs'),
    path = require('path'),
    Parser = require('./parser/Parser'),
    TokenStream = require('./parser/TokenStream');

function compile(base, file) {
    var source = fs.readFileSync(path.join(base, file)).toString();
    var p = new Parser(file, base, source, 0);
    p.parse();
}

compile('test', 'ops.gb.s');

