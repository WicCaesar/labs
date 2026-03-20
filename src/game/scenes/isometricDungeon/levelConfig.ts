import type { Vec2 } from './types';
import { parseDungeonMap, type DungeonMarker, type DungeonPushBlockSpawn } from './dungeonMapParser';
import type { DirectionKey } from './types';
import defaultLevelMapRaw from './maps/default.level.map.txt?raw';
import secondLevelMapRaw from './maps/second.level.map.txt?raw';
import thirdLevelMapRaw from './maps/third.level.map.txt?raw';
import fourthLevelMapRaw from './maps/fourth.level.map.txt?raw';

export const DUNGEON_LEVEL = {
	ONE: 1,
	TWO: 2,
	THREE: 3,
	FOUR: 4
} as const;

export type DungeonLevelId = typeof DUNGEON_LEVEL[keyof typeof DUNGEON_LEVEL];

export type DungeonState =
	| 'level-one-hunt-blue'
	| 'level-one-blue-unlocked'
	| 'level-two-hunt-red'
	| 'level-two-red-unlocked'
	| 'level-three-hunt-yellow'
	| 'level-three-yellow-unlocked'
	| 'level-four-button-puzzle'
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

export type DungeonFriendlyNpcBehavior =
	| {
		kind: 'friendly-wander';
		speedMultiplier: number;
		decisionMinMs: number;
		decisionMaxMs: number;
	}
	| {
		kind: 'friendly-stationary-fixed';
		facing: DirectionKey;
	}
	| {
		kind: 'friendly-stationary-look-around';
		lookMinMs: number;
		lookMaxMs: number;
	};

export type DungeonEnemyNpcBehavior = {
	kind: 'enemy-chase';
	speedMultiplier: number;
};

export type DungeonNpcBehavior = DungeonFriendlyNpcBehavior | DungeonEnemyNpcBehavior;

export type DungeonNpcDialogue = {
	name: string;
	dialogue: string[];
	portraitAsset?: string;
	quizAfter?: 'blue' | 'yellow' | null;
};

export type DungeonLevelConfig = {
	id: DungeonLevelId;
	map: number[][];
	mapWidth: number;
	mapHeight: number;
	playerSpawn: Vec2;
	npcSpawn: Vec2 | null;
	npcRole: DungeonNpcRole | null;
	npcBehavior: DungeonNpcBehavior | null;
	npcDialogue: DungeonNpcDialogue | null;
	exitTile: Vec2 | null;
	exitLabel: string | null;
	markers: DungeonMarker[];
	pushBlocks: DungeonPushBlockSpawn[];
};

export type DungeonInteractableMarker = Extract<DungeonMarker, { type: 'interactable' }>;

function resolveNpcSpawn(
	friendlyNpcSpawns: Vec2[],
	enemyNpcSpawns: Vec2[]
): { npcSpawn: Vec2 | null; npcRole: DungeonNpcRole | null; npcBehavior: DungeonNpcBehavior | null } {
	// Enemy spawn has priority when both are present so level behavior remains explicit.
	if (enemyNpcSpawns.length > 0) {
		return {
			npcSpawn: enemyNpcSpawns[0],
			npcRole: 'enemy',
			npcBehavior: {
				kind: 'enemy-chase',
				speedMultiplier: 1
			}
		};
	}

	if (friendlyNpcSpawns.length > 0) {
		return {
			npcSpawn: friendlyNpcSpawns[0],
			npcRole: 'friendly',
			npcBehavior: {
				kind: 'friendly-wander',
				speedMultiplier: 1,
				decisionMinMs: 650,
				decisionMaxMs: 1300
			}
		};
	}

	return {
		npcSpawn: null,
		npcRole: null,
		npcBehavior: null
	};
}

const NPC_BEHAVIOR_OVERRIDES: Partial<Record<DungeonLevelId, DungeonNpcBehavior>> = {
	[DUNGEON_LEVEL.ONE]: {
		kind: 'friendly-stationary-fixed',
		facing: 'south'
	},
	[DUNGEON_LEVEL.THREE]: {
		kind: 'friendly-stationary-look-around',
		lookMinMs: 7000,
		lookMaxMs: 7000
	},
	[DUNGEON_LEVEL.FOUR]: {
		kind: 'friendly-stationary-fixed',
		facing: 'west'
	}
};

const NPC_DIALOGUE_DATA: Partial<Record<DungeonLevelId, DungeonNpcDialogue>> = {
	[DUNGEON_LEVEL.ONE]: {
		name: 'Jarbas',
		portraitAsset: 'real-penguin-placeholder',
		dialogue: [
			'Quase me assustou, mas vi você se aproximando.',
			'Já nos vimos antes? Não reconheço seu rosto. Mas também, nós pinguins somos todos iguais.',
			'Não me diga que você é mais um pinguim metido a herói desejando chegar ao último andar da torre e resgatar as cores do mundo…',
			'Que novidade… Dia sim, dia não, aparece alguém assim. Todos fracassaram. O mundo continua preto e branco.',
			'Se pretende mesmo chegar ao último andar, saiba que há muitos desafios a sua espera.',
			'Vai ter de provar sua inteligência e habilidade de resolver enigmas.',
			'E o pior, outros pinguins querendo te derrubar. E, como disse, somos todos iguais…',
			'Você nunca vai saber se alguém vai tentar te ajudar ou te eliminar. Só se tiver um sexto sentido para perceber essas coisas…',
			'Enfim, falei demais. Boa sorte!'
		],
		quizAfter: null
	}
};

function applyNpcBehaviorOverride(
	levelId: DungeonLevelId,
	npcRole: DungeonNpcRole | null,
	defaultBehavior: DungeonNpcBehavior | null
): DungeonNpcBehavior | null {
	if (!npcRole || !defaultBehavior) {
		return null;
	}

	const override = NPC_BEHAVIOR_OVERRIDES[levelId];
	if (!override) {
		return defaultBehavior;
	}

	if (npcRole === 'friendly' && override.kind.startsWith('friendly-')) {
		return override;
	}

	if (npcRole === 'enemy' && override.kind === 'enemy-chase') {
		return override;
	}

	return defaultBehavior;
}

function requirePlayerSpawn(levelName: string, spawn: Vec2 | null): Vec2 {
	// Parser already validates this, but we keep a local guard for type narrowing
	// and to make the configuration invariant explicit.
	if (!spawn) {
		throw new Error(`[${levelName}] missing required player spawn 'P'.`);
	}

	return spawn;
}

export function createLevelConfig(): Record<DungeonLevelId, DungeonLevelConfig> {
	// Parse raw text maps once and expose normalized runtime config for scenes.
	const levelOneMap = parseDungeonMap(defaultLevelMapRaw, 'level-one');
	const levelTwoMap = parseDungeonMap(secondLevelMapRaw, 'level-two');
	const levelThreeMap = parseDungeonMap(thirdLevelMapRaw, 'level-three');
	const levelFourMap = parseDungeonMap(fourthLevelMapRaw, 'level-four');
	const levelOnePlayerSpawn = requirePlayerSpawn('level-one', levelOneMap.playerSpawn);
	const levelTwoPlayerSpawn = requirePlayerSpawn('level-two', levelTwoMap.playerSpawn);
	const levelThreePlayerSpawn = requirePlayerSpawn('level-three', levelThreeMap.playerSpawn);
	const levelFourPlayerSpawn = requirePlayerSpawn('level-four', levelFourMap.playerSpawn);

	const levelOneNpc = resolveNpcSpawn(levelOneMap.friendlyNpcSpawns, levelOneMap.enemyNpcSpawns);
	const levelTwoNpc = resolveNpcSpawn(levelTwoMap.friendlyNpcSpawns, levelTwoMap.enemyNpcSpawns);
	const levelThreeNpc = resolveNpcSpawn(levelThreeMap.friendlyNpcSpawns, levelThreeMap.enemyNpcSpawns);
	const levelFourNpc = resolveNpcSpawn(levelFourMap.friendlyNpcSpawns, levelFourMap.enemyNpcSpawns);

	return {
		[DUNGEON_LEVEL.ONE]: {
			id: DUNGEON_LEVEL.ONE,
			map: levelOneMap.map,
			mapWidth: levelOneMap.width,
			mapHeight: levelOneMap.height,
			playerSpawn: levelOnePlayerSpawn,
			npcSpawn: levelOneNpc.npcSpawn,
			npcRole: levelOneNpc.npcRole,
			npcBehavior: applyNpcBehaviorOverride(DUNGEON_LEVEL.ONE, levelOneNpc.npcRole, levelOneNpc.npcBehavior),
			npcDialogue: NPC_DIALOGUE_DATA[DUNGEON_LEVEL.ONE] ?? null,
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
			playerSpawn: levelTwoPlayerSpawn,
			npcSpawn: levelTwoNpc.npcSpawn,
			npcRole: levelTwoNpc.npcRole,
			npcBehavior: applyNpcBehaviorOverride(DUNGEON_LEVEL.TWO, levelTwoNpc.npcRole, levelTwoNpc.npcBehavior),
			npcDialogue: NPC_DIALOGUE_DATA[DUNGEON_LEVEL.TWO] ?? null,
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
			playerSpawn: levelThreePlayerSpawn,
			npcSpawn: levelThreeNpc.npcSpawn,
			npcRole: levelThreeNpc.npcRole,
			npcBehavior: applyNpcBehaviorOverride(DUNGEON_LEVEL.THREE, levelThreeNpc.npcRole, levelThreeNpc.npcBehavior),
			npcDialogue: NPC_DIALOGUE_DATA[DUNGEON_LEVEL.THREE] ?? null,
			exitTile: levelThreeMap.exitTile,
			exitLabel: levelThreeMap.exitTile ? 'Descend' : null,
			markers: levelThreeMap.markers,
			pushBlocks: levelThreeMap.pushBlocks
		},
		[DUNGEON_LEVEL.FOUR]: {
			id: DUNGEON_LEVEL.FOUR,
			map: levelFourMap.map,
			mapWidth: levelFourMap.width,
			mapHeight: levelFourMap.height,
			playerSpawn: levelFourPlayerSpawn,
			npcSpawn: levelFourNpc.npcSpawn,
			npcRole: levelFourNpc.npcRole,
			npcDialogue: NPC_DIALOGUE_DATA[DUNGEON_LEVEL.FOUR] ?? null,
			npcBehavior: applyNpcBehaviorOverride(DUNGEON_LEVEL.FOUR, levelFourNpc.npcRole, levelFourNpc.npcBehavior),
			exitTile: levelFourMap.exitTile,
			exitLabel: levelFourMap.exitTile ? 'Ascend' : null,
			markers: levelFourMap.markers,
			pushBlocks: levelFourMap.pushBlocks
		}
	};
}