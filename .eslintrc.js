module.exports = {
    "extends": "eslint:recommended",
    "env": {
        "es6": true,
        "node": true
    },
    "rules": {
        "indent": ["error", 4, {
             "SwitchCase": 1
        }],
        "quotes": ["error", "single"],
        "no-var": "error",
        "no-else-return": "error",
        "object-shorthand": ["error", "always"],
        "no-case-declarations": "off",
        "prefer-arrow-callback": "error",
        "prefer-template": "error",
        "prefer-const": "error"
    }
};
