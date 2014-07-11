function Label(token, offset) {
    this.name = token.isRelative ? null : token.value;
    this.offset = token.isRelative ? token.value : offset;
    this.isLocal = token.isLocal;
    this.isReference = token.isReference;
}

Label.prototype = {

};

module.exports = Label;

