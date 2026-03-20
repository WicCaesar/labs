import Phaser from 'phaser';
import {
	DIRECTION_TO_FRAME,
	NPC_DIRECTION_MAX_MS,
	NPC_DIRECTION_MIN_MS,
	NPC_SPEED,
	PLAYER_SCALE,
	TILE_HEIGHT
} from './constants';
import { directionFromVector, projectIsoDirectionToScreen, randomDirection, tryMoveEntity } from './navigation';
import type { DirectionKey, Vec2 } from './types';

type IsoToWorld = (isoX: number, isoY: number) => Vec2;

// Matches player grounding offset so both actor types sit on the same floor plane.
const NPC_FEET_OFFSET_Y = TILE_HEIGHT * 0.02;

const ENEMY_CHASE_BASE_SPEED_MULTIPLIER = 1.15;

const LOOK_AROUND_DIRECTIONS: DirectionKey[] = [
	'north',
	'north-east',
	'east',
	'south-east',
	'south',
	'south-west',
	'west',
	'north-west'
];

export type FriendlyNpcBehavior =
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

export type EnemyNpcBehavior = {
	kind: 'enemy-chase';
	speedMultiplier: number;
};

export type NpcBehavior = FriendlyNpcBehavior | EnemyNpcBehavior;

export type NpcState = {
	gridPos: Vec2;
	facing: DirectionKey;
	direction: Vec2;
	sprite: Phaser.GameObjects.Image;
	decisionTimer: number;
	lookAroundTimer: number;
	behavior: NpcBehavior;
};

export function spawnNpc(
	scene: Phaser.Scene,
	spawnPosition: Vec2,
	isoToWorld: IsoToWorld,
	behavior: NpcBehavior
): NpcState {
	const facing: DirectionKey = behavior.kind === 'friendly-stationary-fixed' ? behavior.facing : 'south';
	const world = isoToWorld(spawnPosition.x, spawnPosition.y);
	const sprite = scene.add.image(world.x, world.y + NPC_FEET_OFFSET_Y, DIRECTION_TO_FRAME[facing]);

	sprite.setOrigin(0.5, 1);
	sprite.setScale(PLAYER_SCALE);
	sprite.setDepth(world.y + 9);

	return {
		gridPos: { ...spawnPosition },
		facing,
		direction: randomDirection(),
		sprite,
		decisionTimer: Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS),
		lookAroundTimer: 0,
		behavior
	};
}

function setNpcFacing(npc: NpcState, facing: DirectionKey) {
	npc.facing = facing;
	npc.sprite.setTexture(DIRECTION_TO_FRAME[npc.facing]);
}

export function updateNpcMovement(
	npc: NpcState,
	delta: number,
	map: number[][],
	worldWidth: number,
	worldHeight: number
) {
	if (npc.behavior.kind === 'friendly-stationary-fixed') {
		if (npc.facing !== npc.behavior.facing) {
			setNpcFacing(npc, npc.behavior.facing);
		}
		return;
	}

	if (npc.behavior.kind === 'friendly-stationary-look-around') {
		npc.lookAroundTimer -= delta;
		if (npc.lookAroundTimer <= 0) {
			const options = LOOK_AROUND_DIRECTIONS.filter((direction) => direction !== npc.facing);
			const nextFacing = options[Phaser.Math.Between(0, options.length - 1)] ?? npc.facing;
			setNpcFacing(npc, nextFacing);
			npc.lookAroundTimer = Phaser.Math.Between(npc.behavior.lookMinMs, npc.behavior.lookMaxMs);
		}
		return;
	}

	const decisionMinMs = npc.behavior.kind === 'friendly-wander'
		? npc.behavior.decisionMinMs
		: NPC_DIRECTION_MIN_MS;
	const decisionMaxMs = npc.behavior.kind === 'friendly-wander'
		? npc.behavior.decisionMaxMs
		: NPC_DIRECTION_MAX_MS;
	const speedMultiplier = npc.behavior.kind === 'friendly-wander'
		? npc.behavior.speedMultiplier
		: 1;

	npc.decisionTimer -= delta;
	if (npc.decisionTimer <= 0) {
		// Wander AI picks a fresh random direction at timed intervals.
		npc.direction = randomDirection();
		npc.decisionTimer = Phaser.Math.Between(decisionMinMs, decisionMaxMs);
	}

	if (npc.direction.x === 0 && npc.direction.y === 0) {
		return;
	}

	const length = Math.hypot(npc.direction.x, npc.direction.y);
	const norm = {
		x: npc.direction.x / length,
		y: npc.direction.y / length
	};

	const distance = (NPC_SPEED * speedMultiplier * delta) / 1000;
	const moved = tryMoveEntity(npc.gridPos, norm, distance, map, worldWidth, worldHeight);

	if (!moved) {
		npc.direction = randomDirection();
		npc.decisionTimer = Phaser.Math.Between(decisionMinMs, decisionMaxMs);
		return;
	}

	setNpcFacing(npc, directionFromVector(projectIsoDirectionToScreen(norm)));
}

export function updateEnemyNpcMovement(
	npc: NpcState,
	playerPos: Vec2,
	delta: number,
	map: number[][],
	worldWidth: number,
	worldHeight: number
) {
	const toPlayer = {
		x: playerPos.x - npc.gridPos.x,
		y: playerPos.y - npc.gridPos.y
	};

	const distanceToPlayer = Math.hypot(toPlayer.x, toPlayer.y);
	if (distanceToPlayer <= 0.001) {
		return;
	}

	const norm = {
		x: toPlayer.x / distanceToPlayer,
		y: toPlayer.y / distanceToPlayer
	};

	const chaseSpeedMultiplier = npc.behavior.kind === 'enemy-chase'
		? npc.behavior.speedMultiplier
		: 1;
	const distance = (NPC_SPEED * ENEMY_CHASE_BASE_SPEED_MULTIPLIER * chaseSpeedMultiplier * delta) / 1000;
	const moved = tryMoveEntity(npc.gridPos, norm, distance, map, worldWidth, worldHeight);

	if (!moved) {
		npc.direction = randomDirection();
		npc.decisionTimer = Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS);
		const directionLength = Math.hypot(npc.direction.x, npc.direction.y);
		if (directionLength > 0) {
			// Chaser fallback prevents full stalls when direct path is blocked.
			const fallbackNorm = {
				x: npc.direction.x / directionLength,
				y: npc.direction.y / directionLength
			};
			tryMoveEntity(npc.gridPos, fallbackNorm, distance * 0.85, map, worldWidth, worldHeight);
			setNpcFacing(npc, directionFromVector(projectIsoDirectionToScreen(fallbackNorm)));
		}
		return;
	}

	setNpcFacing(npc, directionFromVector(projectIsoDirectionToScreen(norm)));
}

export function syncNpcSprite(npc: NpcState, isoToWorld: IsoToWorld) {
	const world = isoToWorld(npc.gridPos.x, npc.gridPos.y);
	npc.sprite.setPosition(world.x, world.y + NPC_FEET_OFFSET_Y);
	npc.sprite.setDepth(world.y + 9);
}