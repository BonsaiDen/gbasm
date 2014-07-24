# Build
rom: 
	@mkdir -p build
	@node index.js -o build/game.gb -s build/game.sym tuff/src/main.gb.s

# Emulation
run: rom
	gngb --fps -a build/game.gb

gambatte: rom
	gambatte_qt build/game.gb

bgb: rom
	WINEPREFIX=~/.local/share/wineprefixes/steam wine ~/.local/bin/bgb.exe build/game.gb

