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
       --verbose, -v: Surpresses all logging
           --version: Displays version information
              --help: Displays this help text
```


## Output Options


#### `--outfile` / `-o` 

  Specifies the filename of the generated ROM image
  
  
#### `--optimize` / `-O` 

  Turns on assembly optimizations which are automatically performed during linkage.
  
  
#### `--mapfile` / `-m`

  Generates a ASCII overview of the mapped ROM areas.
  
  
#### `--symfile` / `-s` 

  Generates a symbol map file for use with Debuggers (e.g. [bgb](http://bgb.bircd.org/))
  

#### `--jsonfile` / `-j` 

  Generates a *json* file that contains the fully linked ROM data serialized into a detailed format useable for further, custom processing.



## Compatibility Notes

**gbasm** is mostly compatible with [rgbds](https://github.com/bentley/rgbds) 
but there are some deviations and additions:

### General

- *gbasm* is a multipass compiler, meaning the all sources files and definitions are parsed before resolving any names or sizes. 

### Syntax 

- The *load accumulator and increment/decrement hl* type instructions only take `hli` and `hld` as their second operand
- Memory operands do only support `[` and `]` in their syntax
- All names and labels which start with an underscore are treated as being local / private to the file they were defined in

### Macros

- Most of the pre-defined macros from `rgbds` are available (e.g. `COS`, `STRLWR` etc.)
- User defined macros come in to flavors:

  1. __Expression Macros__ 

    These macros contain only a single expression statement and can be used as values everywhere a built-in macro could be used, too.

    ```asm
    MACRO add(@a, @b)
      @a + @b
    ENDMACRO

    DB add(2, 5) ; essentially DB 7
    ```
    
    Expression Macros can take `Numbers` and `Strings` as their arguments.
    
  2. __Expansion Macros__ 

    These are macros in the classical sense which just expand into additional assembler code.

    ```asm
    MACRO header()
      DB $11,$22,$33,$44,$55
      DW $1234,$4567
    ENDMACRO

    header(); expands into the DB and DW diretives above
    ```

	In addition to `Strings` and `Numbers`, expansion macros can also take `Registers` as their arguments.
    
    ```asm
    MACRO ld16(@number, @a, @b)
      ld @a,@number >> 8
      ld @b,@number & $ff
    ENDMACRO

    ld16($1234, b, c); turns into ld b,$12 and ld c,$34
    ```


## License

Licensed under MIT.

