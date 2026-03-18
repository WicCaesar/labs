# Dungeon Map Authoring Guide

This folder contains plain-text dungeon maps. You can edit them without touching game code.

## Quick Rules

1. Each character is one tile.
2. All non-comment rows must have the same length.
3. Use only the symbols from the legend.
4. Keep at least one `P` (player spawn).
5. Add either `N` (friendly NPC) or `E` (enemy NPC) for current gameplay.
6. `S` is optional. Use it when a level has stairs/exit interaction.

## Symbol Legend

- `0`: Walkable floor
- `1`: Blocked wall/obstacle
- `x`: Blocked wall/obstacle (visual alias; same collision as `1`)
- `P`: Player spawn (walkable tile)
- `N`: Friendly NPC spawn (walkable tile)
- `E`: Enemy NPC spawn (walkable tile)
- `S`: Stairs/exit marker (walkable tile)
- `i`: Generic interactable marker (walkable tile)

## Comments and spacing

- Lines starting with `#` are comments and ignored.
- Empty lines are ignored.
- Spaces/tabs inside a map row are ignored, so you may space symbols for readability.

## Example

```txt
# 8x6 simple room
xxxxxxxx
xP00000x
x01110ix
x000000x
x0000N0x
xxxxxxxx
```

## How this connects to gameplay

- Collision: tiles `1` and `x` are blocked.
- Movement: all other symbols are walkable.
- Spawn points and objects are extracted by the parser and consumed by level config.
- The isometric renderer projects this grid to isometric view automatically.

## Common mistakes

- Different row lengths (parser will throw an error).
- Missing `P` spawn.
- Typo in symbols (parser will throw an error for unknown characters).
