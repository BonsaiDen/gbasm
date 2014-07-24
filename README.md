# A JavaScript Gameboy Assembler

```
   --mapfile, -m <s>: Name of the ROM mapping file to be generated (default: )
  --optimize, -O <n>: Set optimization level (default: 0)
   --outfile, -o <s>: The name of the output rom file (default: game.gb)
        --silent, -S: Do not produce any logging output (default: false)
   --symfile, -s <s>: Name of the symbol map file to be generated (default: )
       --verbose, -v: Turn on verbose logging (default: false)
       --version, -V: Version information (default: false)
      --warnings, -w: Enable compiler warnings (default: false)
              --help: Display this help text
```

### Installation

`$ npm install -g gbasm`


### Implementation Status

Code and ROM generation are working, although there might still be some edge cases 
were things fall apart.
 
The following things are not completely implemented at the moment:

- The verbose does nothing at the time
- Some errors do not yet have fully fledged compiler errors and will simply throw a `TypeError`, crashing the compiler
- There are no additional compiler warnings at the moment, so `--warnings` does nothing
- There's only one `MACRO` function implemented at the time which is `UPRSTR`


### License

Licensed under MIT.

