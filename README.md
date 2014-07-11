A Work in Progress Gameboy Assembler 
------------------------------------

A the moment, only the core lexer and instruction parsing / generation are 
implemented. This means, it will not yet create any kind of ROM image.


Upcoming features:

  - The obivous support of generating a ROM imaging and support basic assembler instructions like `INCLUDE`, `SECTION` etc.
  - Provide a simple interface for editor intergration to parse instruction sizes / cycle counts
  - Powerful macro support by inlining JavaScript Expressions
  - Lots of statistics like ROM space allocation and segment distribution
  - Basic ROM layout like Cartridge Name, Type, Sizes via a `package.json` like structure


### License

Licensed under MIT.


Compiler
    SourceFile
        Parser
            Lexer
            TokenStream

    SourceFile
        Parser
            Lexer
            TokenStream

    Linker
        
