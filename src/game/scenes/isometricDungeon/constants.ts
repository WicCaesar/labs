import type { DirectionKey, Vec2 } from './types';

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const HALF_TILE_WIDTH = TILE_WIDTH / 2;
export const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;

export const PLAYER_SPEED = 4;
export const NPC_SPEED = 2.5;
export const PLAYER_SCALE = 1.2;

export const WORLD_WIDTH = 16;
export const WORLD_HEIGHT = 16;

export const NPC_DIRECTION_MIN_MS = 650;
export const NPC_DIRECTION_MAX_MS = 1300;
export const INTERACTION_DISTANCE = 1.05;

export const FLOOR_COLOR_VARIANTS = [0xff7a59, 0x6bcf63, 0x4fc3f7, 0xf6d34f, 0xc084fc];
export const FLOOR_STROKE_VARIANTS = [0xd95d3f, 0x4ca548, 0x2e95c7, 0xc2a336, 0x9762ca];

export const DIRECTION_TO_FRAME: Readonly<Record<DirectionKey, string>> = {
	north: 'penguin-north',
	'north-east': 'penguin-north-east',
	east: 'penguin-east',
	'south-east': 'penguin-south-east',
	south: 'penguin-south',
	'south-west': 'penguin-south-west',
	west: 'penguin-west',
	'north-west': 'penguin-north-west'
};

export const RANDOM_DIRECTION_CHOICES: ReadonlyArray<Vec2> = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: -1, y: 0 },
	{ x: 0, y: 1 },
	{ x: 0, y: -1 },
	{ x: 1, y: 1 },
	{ x: 1, y: -1 },
	{ x: -1, y: 1 },
	{ x: -1, y: -1 }
];