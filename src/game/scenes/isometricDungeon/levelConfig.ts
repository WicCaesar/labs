import type { Vec2 } from './types';
import { buildDefaultDungeonMap } from './defaultDungeonMap';
import { buildSecondDungeonMap } from './secondDungeonMap';

export const DUNGEON_LEVEL = {
	ONE: 1,
	TWO: 2
} as const;

export type DungeonLevelId = typeof DUNGEON_LEVEL[keyof typeof DUNGEON_LEVEL];

export type DungeonState =
	| 'level-one-hunt-blue'
	| 'level-one-blue-unlocked'
	| 'level-two-hunt-red'
	| 'complete';

export type DungeonHudState = {
	level: DungeonLevelId;
	status: string;
	hint: string;
	objective: string;
	canInteract: boolean;
	state: DungeonState;
};

export type DungeonLevelConfig = {
	id: DungeonLevelId;
	map: number[][];
	playerSpawn: Vec2;
	npcSpawn: Vec2;
	exitTile: Vec2 | null;
	exitLabel: string | null;
};

export function createLevelConfig(worldWidth: number, worldHeight: number): Record<DungeonLevelId, DungeonLevelConfig> {
	return {
		[DUNGEON_LEVEL.ONE]: {
			id: DUNGEON_LEVEL.ONE,
			map: buildDefaultDungeonMap(worldWidth, worldHeight),
			playerSpawn: { x: 2, y: 2 },
			npcSpawn: { x: worldWidth - 4, y: worldHeight - 4 },
			exitTile: { x: 8, y: 8 },
			exitLabel: 'Descend'
		},
		[DUNGEON_LEVEL.TWO]: {
			id: DUNGEON_LEVEL.TWO,
			map: buildSecondDungeonMap(worldWidth, worldHeight),
			playerSpawn: { x: 2, y: worldHeight - 3 },
			npcSpawn: { x: worldWidth - 3, y: 2 },
			exitTile: null,
			exitLabel: null
		}
	};
}