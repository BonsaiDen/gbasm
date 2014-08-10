# A JavaScript Gameboy Assembler

**gbasm** is a JavaScript based compiler for Gameboy z80 assembly code.

`gbasm` is mainly being developed for and tested with [Tuff](https://github.com/BonsaiDen/Tuff.gb). 

The compiler has a big focus on performance and is able to fully parse, link 
and generate the Tuff.gb ROM in less than 90ms on an old Intel i5.


```
Usage: gbasm [options] [sources]

   --outfile, -o <s>: The name of the output rom file (default: game.gb)
      --optimize, -O: Enable instruction optimizations
   --mapfile, -m <s>: Generates a ASCII overview of the mapped ROM space
   --symfile, -s <s>: Generates a symbol map compatible with debuggers
  --jsonfile, -j <s>: Generates a JSON data dump of all sections with their data, labels, instructions etc.
        --silent, -S: Surpresses all logging
       --verbose, -v: Turn on verbose logging
       --version, -V: Displays version information
              --help: Displays this help text
```


### Installation and Usage

1. Get Node.js and npm
2. `npm install -g gbasm`
3. `gbasm sourceFile`
4. 'gbemulator game.gb'


### Compatibility Notes

**gbasm** is mostly compatible with [rgbds](https://github.com/bentley/rgbds) 
but there are some deviations and additions:

- *gbasm* is a multipass compiler, meaning the all sources files and definitions are parsed before resolving any names, which in turn means that you can reference any name as long as it is eventually defined by a file
- The *load accumulator and increment/decrement hl* type instructions only take `hli` and `hld` as their second operand
- Memory operands do only support `[` and `]` in their syntax
- All names and labels which start with an underscore are treated as being local / private to the file they were defined in


### Roadmap

- Documentation
- Additional compiler errors and warnings
- User definable macros
- Unit Tests
 

### License

Licensed under MIT.

