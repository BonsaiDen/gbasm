var Tokenizer = require('./Tokenizer');

function Matcher(id) {

    this.id = id;
    this.match = {
        leading: null,
        subsequent: null
    };

    this.transforms = [];
    this.reducers = [];
    this.groups = [];
    this.lookahead = 0;

}

function Lexer() {

    function list(args) {
        if (arguments.length > 1) {
            return list(arguments).filter(function(arg) {
                return arg !== undefined;
            });

        } else {
            return Array.isArray(args) ? args : Array.prototype.slice.call(args);
        }
    }

    function push(to, args) {
        to.push.apply(to, list(args));
    }

    var matchers = [];
    function matcher(id) {

        if (id.toUpperCase() !== id) {
            throw new TypeError('Token ID must be all uppercase.');
        }

        var m = new Matcher(id);

        var chain = {

            // Match any continious set of these characters
            match: function(leading) {
                m.match.leading = leading;
                return chain;
            },

            subsequent: function(subsequent) {
                m.match.subsequent = subsequent;
                return chain;
            },


            // Transform the matched characters (i.e. replacing, removing etc.)
            transform: function(from, to) {

                if (typeof from === 'number') {
                    m.transforms.push({
                        type: 'trim',
                        range: list(from, to)
                    });

                } else if (typeof from === 'string') {
                    m.transforms.push({
                        type: 'replace',
                        from: new RegExp(from, 'g'),
                        to: to
                    });

                } else if (from instanceof RegExp) {
                    m.transforms.push({
                        type: 'replace',
                        from: from,
                        to: to
                    });
                }

                return chain;
            },

            replace: function(from, to) {
                return chain.transform(from, to);
            },


            // Reduce the matched characters into smaller tokens
            reduce: function(id, exp) {

                m.reducers.push({
                    id: id,
                    match: arguments.length === 1 ? null :
                           arguments.length > 2 ? list(arguments).slice(1) : exp
                });

                return chain;

            },


            // String like sequences with delimiters and escaping
            group: function(start, end, stripEnd) {

                m.lookahead = Math.max(m.lookahead, start.length);

                if (end) {
                    m.lookahead = Math.max(m.lookahead, end.length);
                }

                m.groups.push({
                    start: start,
                    end: end === undefined ? start : end,
                    stripEnd: stripEnd || false,
                    escape: []
                });

                return chain;

            },

            escape: function() {
                push(m.groups[m.groups.length - 1].escape, arguments);
                return chain;
            },


            // Trim the token value
            trim: function(from, to) {
                return chain.transform(from, to);
            }

        };

        matchers.push(m);

        return chain;

    }

    matcher.tokenizer = function() {
        return new Tokenizer(matchers);
    };

    return matcher;

}

module.exports = Lexer;

