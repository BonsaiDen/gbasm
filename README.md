# A JavaScript Gameboy Assembler

**gbasm** is a JavaScript based compiler for Gameboy z80 assembly code.

`gbasm` is mainly being developed for and tested with [Tuff](https://github.com/BonsaiDen/Tuff.gb). 


### Installation and Usage

1. Install [Node.js](https://nodejs.org)
2. Now install `gbasm` by running `npm install -g gbasm`


```
Usage: gbasm [options] [sources]

   --outfile, -o <s>: The name of the output rom file (default: game.gb)
      --optimize, -O: Enable instruction optimizations
   --mapfile, -m <s>: Generates a ASCII overview of the mapped ROM space
   --symfile, -s <s>: Generates a symbol map compatible with debuggers
  --jsonfile, -j <s>: Generates a JSON data dump of all sections with their data, labels, instructions etc.
        --silent, -S: Surpresses all logging
       --version, -V: Displays version information
              --help: Displays this help text
```


## Output Options


#### `--outfile` / `-o` 

  Specifies the filename of the generated ROM image
  
  
#### `--optimize` / `-O` 

  Turns on assembly optimizations which are automatically performed during linkage.
  
  
#### `--mapfile` / `-m`

  Generates a overview of the mapped ROM areas akin to be one below
  
  
#### `--symfile` / `-s` 

  Generates a symbol map file for use with Debuggers (e.g. [bgb]())
  

#### `--jsonfile` / `-j` 

  Generates a *json* file that contains the fully linked ROM data serialized into a detailed format useable for further, custom processing.



## Compatibility Notes

**gbasm** is mostly compatible with [rgbds](https://github.com/bentley/rgbds) 
but there are some deviations and additions:

- *gbasm* is a multipass compiler, meaning the all sources files and definitions are parsed before resolving any names or sizes. 
- The *load accumulator and increment/decrement hl* type instructions only take `hli` and `hld` as their second operand
- Memory operands do only support `[` and `]` in their syntax
- All names and labels which start with an underscore are treated as being local / private to the file they were defined in
- Most of the pre-defined macros from `rgbds` are available 
- There is currently no support for custom macros



## License

Licensed under MIT.

