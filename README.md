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
         --debug, -d: Enable support for custom "msg" debug opcodes',
       --verbose, -v: Surpresses all logging
           --version: Displays version information
              --help: Displays this help text
```


## Output Options


- __ `--outfile` / `-o` __

  Specifies the filename of the generated ROM image.
  
  
- __ `--optimize` / `-O` __

  Turns on assembly optimizations which are automatically performed during linkage.
  
  
- __ `--mapfile` / `-m`__

  Generates a ASCII overview of the mapped ROM areas.
  
  
- __ `--symfile` / `-s` __

  Generates a symbol map file for use with Debuggers (e.g. [bgb](http://bgb.bircd.org/))
  

- __ `--debug` / `-d` __

  Enables support for custom `msg` opcodes for use with Debuggers (e.g. [bgb](http://bgb.bircd.org/))

  ```asm
  ; This will log "Debug Message" when run in the debugger
  msg "Debug Message"
  ```
  
  > Note: The `msg` opcode will be ignored when compiling without the flag.


- __ `--jsonfile` / `-j` __

  Generates a *json* file that contains the fully linked ROM data serialized into a detailed format useable for further, custom processing.



## Compatibility Notes

**gbasm** is mostly compatible with [rgbds](https://github.com/bentley/rgbds) 
but there are some deviations and additions:

### General

- *gbasm* is a multipass compiler, meaning the all sources files and definitions 
are parsed before resolving any names or sizes. 

### Syntax 

- The *load accumulator and increment/decrement hl* type instructions only take `hli` and `hld` as their second operand
- Memory operands do only support `[` and `]` in their syntax
- All names and labels which start with an underscore are treated as being local / private to the file they were defined in

### Macros

- Most of the pre-defined macros from `rgbds` are available (e.g. `COS`, `STRLWR` etc.)
- User defined macros come in two flavors:

  1. __Expression Macros__ 

    These macros contain only a single expression statement and can be used as values everywhere a built-in macro could be used:

    ```asm
    MACRO add(@a, @b)
      @a + @b
    ENDMACRO

    DB add(2, 5) ; essentially DB 7
    ```
    
    Expression Macros can take `Numbers` and `Strings` as their arguments.
    
  2. __Expansion Macros__ 

    These are macros in the classical sense which just expand into additional assembler code:

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

### Instructions

**gbasm** supports additional meta instructions at the source code level, which will be compiled down to multiple native instructions.

These aim at increasing the readability of the source.

#### **ldxa**

Extended memory loads using the `Accumulator` as an intermediate register (destroying its contents):

```asm
; ld  a,[hli]
; ld  R,a
ldxa  b,[hli]
ldxa  c,[hli]
ldxa  d,[hli]
ldxa  e,[hli]
ldxa  h,[hli]
ldxa  l,[hli]

; ld  a,[hld]
; ld  R,a
ldxa  b,[hld]
ldxa  c,[hld]
ldxa  d,[hld]
ldxa  e,[hld]
ldxa  h,[hld]
ldxa  l,[hld]

; ld  a,R
; ld  [hli],a
ldxa  [hli],b
ldxa  [hli],c
ldxa  [hli],d
ldxa  [hli],e
ldxa  [hli],h
ldxa  [hli],l

; ld   a,R
; ld   [hld],a
ldxa  [hld],b
ldxa  [hld],c
ldxa  [hld],d
ldxa  [hld],e
ldxa  [hld],h
ldxa  [hld],l

; ld  a,$ff
; ld  [$0000],a
ldxa  [$0000],$ff

; ld  a,R
; ld  [$0000],a
ldxa  [$0000],b
ldxa  [$0000],c
ldxa  [$0000],d
ldxa  [$0000],e
ldxa  [$0000],h
ldxa  [$0000],l

; ld  a,[hli]
; ld  [$0000],a
ldxa  [$0000],[hli]

; ld  a,[hld]
; ld  [$0000],a
ldxa  [$0000],[hld]

; ld  a,[$0000]
; ld  [$0000],a
ldxa  [$0000],[$0000]

; ld  a,[$0000]
; ld  R,a
ldxa  b,[$0000]
ldxa  c,[$0000]
ldxa  d,[$0000]
ldxa  e,[$0000]
ldxa  h,[$0000]
ldxa  l,[$0000]

; ld  a,[$0000]
; ld  [hli],a
ldxa  [hli],[$0000]

; ld  a,[$0000]
; ld  [hld],a
ldxa  [hld],[$0000]
```

## License

Licensed under MIT.

