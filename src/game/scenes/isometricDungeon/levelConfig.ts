import type { Vec2 } from './types';
import { parseDungeonMap, type DungeonMarker, type DungeonPushBlockSpawn } from './dungeonMapParser';
import defaultLevelMapRaw from './maps/default.level.map.txt?raw';
import secondLevelMapRaw from './maps/second.level.map.txt?raw';
import thirdLevelMapRaw from './maps/third.level.map.txt?raw';

export const DUNGEON_LEVEL = {
	ONE: 1,
	TWO: 2,
	THREE: 3
} as const;

export type DungeonLevelId = typeof DUNGEON_LEVEL[keyof typeof DUNGEON_LEVEL];

export type DungeonState =
	| 'level-one-hunt-blue'
	| 'level-one-blue-unlocked'
	| 'level-two-hunt-red'
	| 'level-two-red-unlocked'
	| 'level-three-hunt-yellow'
	| 'complete';

export type DungeonHudState = {
	level: DungeonLevelId;
	status: string;
	hint: string;
	objective: string;
	canInteract: boolean;
	state: DungeonState;
};

export type DungeonNpcRole = 'friendly' | 'enemy';

export type DungeonLevelConfig = {
	id: DungeonLevelId;
	map: number[][];
	mapWidth: number;
	mapHeight: number;
	playerSpawn: Vec2;
	npcSpawn: Vec2;
	npcRole: DungeonNpcRole;
	exitTile: Vec2 | null;
	exitLabel: string | null;
	markers: DungeonMarker[];
	pushBlocks: DungeonPushBlockSpawn[];
};

export type DungeonInteractableMarker = Extract<DungeonMarker, { type: 'interactable' }>;

function resolveNpcSpawn(
	levelName: string,
	friendlyNpcSpawns: Vec2[],
	enemyNpcSpawns: Vec2[]
): { npcSpawn: Vec2; npcRole: DungeonNpcRole } {
	if (enemyNpcSpawns.length > 0) {
		return {
			npcSpawn: enemyNpcSpawns[0],
			npcRole: 'enemy'
		};
	}

	if (friendlyNpcSpawns.length > 0) {
		return {
			npcSpawn: friendlyNpcSpawns[0],
			npcRole: 'friendly'
		};
	}

	throw new Error(`[${levelName}] missing NPC spawn. Add 'N' or 'E' to the map.`);
}

export function createLevelConfig(): Record<DungeonLevelId, DungeonLevelConfig> {
	const levelOneMap = parseDungeonMap(defaultLevelMapRaw, 'level-one');
	const levelTwoMap = parseDungeonMap(secondLevelMapRaw, 'level-two');
	const levelThreeMap = parseDungeonMap(thirdLevelMapRaw, 'level-three');

	const levelOneNpc = resolveNpcSpawn('level-one', levelOneMap.friendlyNpcSpawns, levelOneMap.enemyNpcSpawns);
	const levelTwoNpc = resolveNpcSpawn('level-two', levelTwoMap.friendlyNpcSpawns, levelTwoMap.enemyNpcSpawns);
	const levelThreeNpc = resolveNpcSpawn('level-three', levelThreeMap.friendlyNpcSpawns, levelThreeMap.enemyNpcSpawns);

	return {
		[DUNGEON_LEVEL.ONE]: {
			id: DUNGEON_LEVEL.ONE,
			map: levelOneMap.map,
			mapWidth: levelOneMap.width,
			mapHeight: levelOneMap.height,
			playerSpawn: levelOneMap.playerSpawn,
			npcSpawn: levelOneNpc.npcSpawn,
			npcRole: levelOneNpc.npcRole,
			exitTile: levelOneMap.exitTile,
			exitLabel: levelOneMap.exitTile ? 'Descend' : null,
			markers: levelOneMap.markers,
			pushBlocks: levelOneMap.pushBlocks
		},
		[DUNGEON_LEVEL.TWO]: {
			id: DUNGEON_LEVEL.TWO,
			map: levelTwoMap.map,
			mapWidth: levelTwoMap.width,
			mapHeight: levelTwoMap.height,
			playerSpawn: levelTwoMap.playerSpawn,
			npcSpawn: levelTwoNpc.npcSpawn,
			npcRole: levelTwoNpc.npcRole,
			exitTile: levelTwoMap.exitTile,
			exitLabel: levelTwoMap.exitTile ? 'Ascend' : null,
			markers: levelTwoMap.markers,
			pushBlocks: levelTwoMap.pushBlocks
		},
		[DUNGEON_LEVEL.THREE]: {
			id: DUNGEON_LEVEL.THREE,
			map: levelThreeMap.map,
			mapWidth: levelThreeMap.width,
			mapHeight: levelThreeMap.height,
			playerSpawn: levelThreeMap.playerSpawn,
			npcSpawn: levelThreeNpc.npcSpawn,
			npcRole: levelThreeNpc.npcRole,
			exitTile: null,
			exitLabel: null,
			markers: levelThreeMap.markers,
			pushBlocks: levelThreeMap.pushBlocks
		}
	};
}