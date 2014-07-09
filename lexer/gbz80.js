var Lexer = require('./Lexer');

var l = new Lexer();

l('WHITESPACE').match(' \t\v');
l('NEWLINE').match('\n\r');

l('DECIMAL')
    .match('-0123456789')
    .subsequent('0123456789');

l('HEX')
    .match('$')
    .subsequent('0123456789ABCDEFabcdef')
    .trim(1);

l('BINARY')
    .match('%')
    .subsequent('01');

l('STRING')
    .group('"').escape('\\')
    .group('\'').escape('\\')
    .trim(1, -1);

l('COMMENT')
    .group(';', '\n', true)
    .group(';', '\0', true)
    .trim(1);

l('NAME')
    .match('ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789abcdefghijklmnopqrstuvwxyz')
    .reduce('INSTRUCTION', /^(adc|add|and|bit|call|ccf|cp|cpl|daa|dec|di|ei|halt|inc|jp|jr|ld|ldh|ldhl|nop|or|pop|push|res|ret|reti|rl|rla|rlc|rlca|rr|rra|rrc|rrca|rst|sbc|scf|set|sla|sra|srl|stop|sub|swap|xor)$/i)
    .reduce('MACRO', 'DS', 'DB', 'DW', 'INCLUDE', 'INCBIN', 'EQU', 'EQUS')
    .reduce('NAME');

l('PUNCTUATION')
    .match('@,;:.[]()')
    .reduce('PUNCTUATION', '@', ':', ';', '.', ',', '[', ']', '(', ')');

l('OPERATOR')
    .match('&|><+-/*')
    .reduce('OPERATOR', '&', '&&', '|', '||', '>>', '<<', '+', '-', '/');

var t = l.tokenizer();
module.exports = function(source) {
    return t.parse(source, ['WHITESPACE', 'NEWLINE', 'COMMENT'], true);
};

