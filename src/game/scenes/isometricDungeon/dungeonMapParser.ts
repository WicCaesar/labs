import type { Vec2 } from './types';

export type DungeonMarkerType = 'interactable';

export type DungeonMarker = {
	type: DungeonMarkerType;
	position: Vec2;
};

export type ParsedDungeonMap = {
	map: number[][];
	width: number;
	height: number;
	playerSpawn: Vec2 | null;
	friendlyNpcSpawns: Vec2[];
	enemyNpcSpawns: Vec2[];
	exitTile: Vec2 | null;
	markers: DungeonMarker[];
};

const WALKABLE = 0;
const BLOCKED = 1;

const normalizeRow = (row: string): string => row.replace(/[\t ]+/g, '');

export function parseDungeonMap(rawMap: string, mapName: string): ParsedDungeonMap {
	const sourceRows = rawMap
		.split(/\r?\n/g)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('#'))
		.map(normalizeRow)
		.filter((line) => line.length > 0);

	if (sourceRows.length === 0) {
		throw new Error(`[${mapName}] map has no rows.`);
	}

	const width = sourceRows[0].length;
	if (width === 0) {
		throw new Error(`[${mapName}] map rows are empty.`);
	}

	for (let y = 0; y < sourceRows.length; y += 1) {
		if (sourceRows[y].length !== width) {
			throw new Error(
				`[${mapName}] row ${y + 1} has width ${sourceRows[y].length}, expected ${width}.`
			);
		}
	}

	const map: number[][] = [];
	let playerSpawn: Vec2 | null = null;
	let exitTile: Vec2 | null = null;
	const friendlyNpcSpawns: Vec2[] = [];
	const enemyNpcSpawns: Vec2[] = [];
	const markers: DungeonMarker[] = [];

	for (let y = 0; y < sourceRows.length; y += 1) {
		const row: number[] = [];
		for (let x = 0; x < width; x += 1) {
			const symbol = sourceRows[y][x];
			switch (symbol) {
				case '0':
				case '.':
					row.push(WALKABLE);
					break;
				case '1':
				case 'x':
				case 'X':
				case '#':
					row.push(BLOCKED);
					break;
				case 'P':
					row.push(WALKABLE);
					playerSpawn = { x, y };
					break;
				case 'N':
					row.push(WALKABLE);
					friendlyNpcSpawns.push({ x, y });
					break;
				case 'E':
					row.push(WALKABLE);
					enemyNpcSpawns.push({ x, y });
					break;
				case 'S':
					row.push(WALKABLE);
					exitTile = { x, y };
					break;
				case 'i':
					row.push(WALKABLE);
					markers.push({
						type: 'interactable',
						position: { x, y }
					});
					break;
				default:
					throw new Error(`[${mapName}] unsupported symbol '${symbol}' at (${x}, ${y}).`);
			}
		}
		map.push(row);
	}

	if (!playerSpawn) {
		throw new Error(`[${mapName}] missing required player spawn 'P'.`);
	}

	return {
		map,
		width,
		height: sourceRows.length,
		playerSpawn,
		friendlyNpcSpawns,
		enemyNpcSpawns,
		exitTile,
		markers
	};
}
