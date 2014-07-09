// Tokens ---------------------------------------------------------------------
function PlainToken(id, raw, value) {
    this.id = id;
    this.raw = raw;
    this.value = value;
}

function PositionalToken(id, raw, value, from, to) {
    this.id = id;
    this.raw = raw;
    this.value = value;
    this.from = from;
    this.to = to;
}

function ErrorToken(id, raw, value, from, to, error) {
    this.id = id;
    this.raw = raw;
    this.value = value;
    this.from = from;
    this.to = to;
    this.error = error;
}

function Token(id, raw, value, from, to, error) {
    if (error) {
        return new ErrorToken(id, raw, value, from, to, error);

    } else if (from && to) {
        return new PositionalToken(id, raw, value, from, to);

    } else {
        return new PlainToken(id, raw, value);
    }
}


// Tokenizer ------------------------------------------------------------------
function Tokenizer(matchers) {

    this.lookahead = 0;
    this.matchers = matchers;

    for(var i = 0, l = matchers.length; i < l; i++) {
        this.lookahead = Math.max(this.lookahead, matchers[i].lookahead);
    }

    this.zeroPadding = new Array(this.lookahead).join('\0');

}

Tokenizer.NoMatch = 0;
Tokenizer.Stopped = 1;

Tokenizer.prototype = {

    append: function(data) {
        this.buffer += data;
    },

    reset: function() {

        this.buffer = '';
        this.position = 0;
        this.generateOffsets = false;

        this.line = {
            current: 1,
            next: 1
        };

        this.col = {
            current: 0,
            next: 0
        };

    },


    // Parse the requested data -----------------------------------------------
    parse: function(data, ignored, offsets) {

        this.reset();
        this.append(data);

        this.generateOffsets = offsets;

        var tokens = [];
        while(this.position < this.buffer.length) {

            var token = this.next(ignored);
            if (token === false) {
                if (offsets) {
                    throw new Error('Unmatched character "' + this.at(0) + '" (code ' + this.at(0).charCodeAt(0) + ') at line ' + (this.line.current + 1) + ', col ' + (this.col.current + 1));

                } else {
                    throw new Error('Unmatched character "' + this.at(0) + '" at position ' + this.position);
                }
                break;

            } else if (token instanceof ErrorToken) {
                if (offsets) {
                    throw new Error('Could not reduce ' + token.id + ' "' + token.raw + '" at line ' + (this.line.current + 1) + ', col ' + (this.col.current + 1));

                } else {
                    throw new Error('Could not reduce ' + token.id + ' "' + token.raw + '" at position ' + this.position);
                }
                break;

            } else if (token) {
                tokens.push(token);
            }

        }

        return tokens;

    },


    // Parse the next token ---------------------------------------------------
    next: function(ignored) {

        var token;
        for(var i = 0, l = this.matchers.length; i < l; i++) {
            token = this.match(this.matchers[i], ignored);
            if (token !== false) {
                return token;
            }
        }
        return false;

    },

    match: function(m, ignored) {

        var active = false,
            offset = 0,
            i, l;

        // Toggle Matcher
        if (m.groups.length) {

            // Go through all toggle matchers
            for(i = 0, l = m.groups.length; i < l; i++) {

                var g = m.groups[i];
                while(this.matchGroup(g.start, g.end, g.escape, offset, active)) {

                    active = true;
                    offset++;

                    // If we exceeded the buffer then there was no match
                    if (this.position + offset > this.buffer.length) {
                        active = false;
                        offset = 0;
                        break;
                    }

                }

                if (active) {
                    if (g.stripEnd) {
                        offset -= g.end.length;
                    }
                    break;
                }

            }

        // Continuous matcher
        } else if (m.match.leading) {
            while(this.matchContinuos(m.match, offset, this.at(offset))) {
                offset++;
            }
        }

        // If we found a matching string parse it
        if (offset) {
            return this.tokenFromMatch(m, active ? offset + 1 : offset, ignored);

        } else {
            return false;
        }

    },

    tokenFromMatch: function(m, offset, ignored) {

        var raw = this.range(0, offset),
            value = raw,
            difference = 0,
            token;

        // Transform
        if (m.transforms.length) {
            value = this.applyTransforms(m.transforms, raw);
            difference = raw.length - value.length;
        }

        // Reduce
        if (m.reducers.length) {

            // Try to reduce the match further down
            if ((token = this.applyReducers(m.reducers, value))) {
                this.position += difference;

            // If we fail to reduce here return a error token
            } else {
                return this.token(m.id, raw, value, this.position, this.position + raw.length, 'invalid');
            }

        } else {
            token = this.token(m.id, value, raw, this.position, this.position + raw.length);
        }

        // Update buffer index
        this.position += token.raw.length;

        return (!ignored || ignored.indexOf(token.id) === -1) ? token : null;

    },

    applyTransforms: function(transforms, raw) {

        for(var i = 0, l = transforms.length; i < l; i++) {

            var t = transforms[i];
            if (t.type === 'trim') {
                raw = raw.slice.apply(raw, t.range);

            } else if (t.type === 'replace') {
                raw = raw.replace(t.from, t.to);
            }

        }

        return raw;

    },

    applyReducers: function(reducers, value) {

        for(var i = 0; i < reducers.length; i++) {

            var reducer = reducers[i],
                match = null,
                matchValue = null;

            // Regular expression based
            if (reducer.match instanceof RegExp) {
                match = value.match(reducer.match);
                if (match) {
                    matchValue = match[0];
                }

            // Empty Matcher
            } else if (reducer.match === null) {
                matchValue = value;

            // String list based
            } else {

                for(var e = 0; e < reducer.match.length; e++) {
                    match = reducer.match[e];
                    if (value.substring(0, match.length) === match) {
                        matchValue = match;
                        break;
                    }
                }
            }

            if (matchValue !== null) {
                return this.token(reducer.id, matchValue, matchValue, this.position, this.position + matchValue.length);
            }

        }

        return null;

    },


    // Matchers ---------------------------------------------------------------
    matchGroup: function(start, end, escape, index, active) {

        if (active) {

            var escaped = escape.length !== 0 && escape.indexOf(this.at(index - 1)) !== -1;
            if (escaped) {
                return true;

            } else {
                return !this.matchRange(index - end.length + 1, end);
            }

        } else {
            return index === 0 && this.matchRange(index, start);
        }

    },

    matchContinuos: function(m, index, current) {

        if (index === 0 || !m.subsequent) {
            return m.leading instanceof RegExp ? m.leading.test(current) : m.leading.indexOf(current) !== -1;

        } else {
            return m.subsequent instanceof RegExp ? m.subsequent.test(current) : m.subsequent.indexOf(current) !== -1;
        }

    },

    matchRange: function(offset, value) {
        return this.range(offset, value.length) === value;
    },


    // Token constructor ------------------------------------------------------
    token: function(id, value, raw, fromIndex, toIndex, error) {

        if (this.generateOffsets) {

            this.line.current = this.line.next;
            this.col.current = this.col.next;

            for(var i = 0; i < raw.length; i++) {
                if (raw[i] === '\n' || raw[i] === '\r') {
                    this.line.next++;
                    this.col.next = 0;

                } else {
                    this.col.next++;
                }
            }

            return new Token(id, raw, value, {
                index: fromIndex,
                line: this.line.current,
                col: this.col.current

            }, {
                index: toIndex,
                line: this.line.next,
                col: this.col.next

            }, error);

        } else {
            return new Token(id, raw, value, null, null, error);
        }

    },


    // Helper -----------------------------------------------------------------
    at: function(offset) {
        return this.buffer[this.position + offset];
    },

    range: function(from, length) {

        var start = this.position + from,
            end = this.position + from + length,
            left = this.buffer.length - end;

        if (left < 0) {
            return this.buffer.substring(start, end + left) + this.zeroPadding.substring(0, Math.abs(left));

        } else {
            return this.buffer.substring(start, end);
        }

    }

};

module.exports = Tokenizer;

