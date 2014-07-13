# A modern Gameboy Assembler

```
     --listfile, -l: Name of the assembly listing file to be generated
      --mapfile, -m: Name of the ROM mapping file to be generated
  --outfile, -o <s>: The name of the output rom file (default: game.gb)
       --silent, -S: Do not produce any logging output (default: false)
       --stdout, -t: Write any output to standard out instead of a file (default: false)
  --symfile, -s <s>: Name of the symbol map file to be generated (default: )
      --verbose, -v: Turn on verbose logging (default: false)
      --version, -V: Version information (default: false)
     --warnings, -w: Enable compiler warnings (default: false)
             --help: Display this help text
```

## Implementation Status

Code and ROM genration are working, although there might still be some edge cases 
were things fall apart.
 
The following things are not completely implemented at the moment:

- Mapfile generation is missing
- The verbose, stdout and silent flags do nothing
- Some error do not yet have full compiler errors and will simply throw `TypeError`
- There are no additional compiler warnings at the moment
- The NPM module does not yet provide a binary interface
- Instruction optimization is implemented but not yet fully tested and thus disabled at the moment
- ROM section default offsets, size checks and data layouts are not yet validated
- Macros are not yet implemented
- Symbol maps do not yet list the correct ROM banks
- `INCBIN` directive for including raw binary data is not implemented


### License

Licensed under MIT.

