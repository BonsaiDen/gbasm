// Expression Parser ----------------------------------------------------------
// ----------------------------------------------------------------------------
function Expression(lexer, tokens) {

    this.index = 0;
    this.token = tokens[0];
    this.list = tokens;
    this.lexer = lexer;

    return this.parseBinary(0);

}

// Methods --------------------------------------------------------------------
Expression.prototype = {

    parseBinary: function(p) {

        // We always start with a unary expression
        var t = this.parseUnary();

        // Now we collect additional binary operators on right as long as their
        // precedence is higher then the initial one
        while(this.isBinary(this.token) && this.prec(this.token.value) > p) {

            // We found a binary operator
            var op = new ExpressionBinaryOp(this.token.value, this.token.index);
            this.next();

            // Now we check it's associativity
            var associativity = (op.id === '^' || op.id === '**') ? 0 : 1;

            // And parse another binaryExpression to it's right
            var t1 = this.parseBinary(this.prec(op.id) + associativity);

            // Then we combine our current expression with the operator and
            // the expression after it to a binary epxression node
            t = new ExpressionNode(op, t, t1);

        }

        return t;

    },

    parseUnary: function() {

        // Unary expressions
        if (this.isUnary(this.token)) {
            var op = new ExpressionUnaryOp(this.token.value, this.token.index);
            this.next();
            return new ExpressionNode(op, this.parseBinary(this.prec(op.id)), null);

        // Parenthesis
        } else if (this.token.type === 'LPAREN') {
            this.next();
            var t = this.parseBinary(0);
            this.expect('RPAREN');
            return t;

        // Values / Calls
        } else if (this.token.type !== 'RPAREN'
                && this.token.type !== 'OPERATOR'
                && this.token.type !== 'COMMA') {

            var e = new ExpressionLeaf(this.token);

            // Names can be part of a macro call
            if (this.token.type === 'NAME') {

                this.next();

                // Check for a potential call expression
                if (this.token && this.token.type === 'LPAREN') {
                    this.next();

                    // Grab it's first argument
                    var args = [this.parseBinary(0)];

                    // Now as long as there is a COMMA after the expression
                    // we consume it and parse another expression
                    while(this.token.type === 'COMMA') {
                        this.next();
                        args.push(this.parseBinary(0));
                    }

                    // Eventually we build the call expression from the name
                    // and it's argument
                    e = new ExpressionCall(e.value, args);
                    this.expect('RPAREN');

                }

            } else {
                this.next();
            }

            return e;

        } else {
            throw new TypeError('Unexpected token when evaluating expression: ' + this.token.type);
        }

    },

    isBinary: function(token) {
        return token
            && token.type === 'OPERATOR'
            && token.value !== '!'
            && token.value !== '~';
    },

    isUnary: function(token) {
        return token
            && token.type === 'OPERATOR'
            && (token.value === '-' || token.value === '!' || token.value === '~' || token.value === '+');
    },

    next: function() {
        this.index++;
        this.token = this.list[this.index];
    },

    expect: function(type) {

        if (this.token === undefined) {
            this.lexer.error('end of expression', null, this.list[this.list.length - 1].index);

        } else if (this.token.type !== type) {
            this.lexer.error(this.token.type, type, this.token.index);

        } else {
            this.next();
        }

    },

    prec: function(op) {

        switch (op) {
            case '||':
                return 1;

            case '&&':
                return 2;

            case '|':
                return 3;

            case '^':
                return 4;

            case '&':
                return 5;

            case '==':
            case '!=':
                return 6;

            case '<':
            case '>':
            case '<=':
            case '>=':
                return 7;

            case '<<':
            case '>>':
                return 8;

            case '+':
            case '-':
            case '!':
            case '~':
                return 9;

            case '*':
            case '/':
            case '%':
                return 11;

            case '**':
                return 12;

            default:
                return 0;
        }

    }

};


// Expression Nodes -----------------------------------------------------------
// ----------------------------------------------------------------------------
function ExpressionNode(op, left, right) {
    this.op = op;
    this.left = left;
    this.right = right;
}

function ExpressionLeaf(value) {
    this.value = value;
}

function ExpressionCall(callee, args) {
    this.callee = callee;
    this.args = args;
}

function ExpressionBinaryOp(id, index) {
    this.id = id;
    this.index = index;
}

function ExpressionUnaryOp(id, index) {
    this.id = id;
    this.index = index;
}

// Exports --------------------------------------------------------------------
Expression.Node = ExpressionNode;
Expression.Leaf = ExpressionLeaf;
Expression.Call = ExpressionCall;

module.exports = Expression;

