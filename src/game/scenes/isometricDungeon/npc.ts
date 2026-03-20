import Phaser from 'phaser';
import {
	DIRECTION_TO_FRAME,
	NPC_DIRECTION_MIN_MS,
	NPC_DIRECTION_MAX_MS,
	NPC_SPEED,
	PLAYER_SCALE,
	TILE_HEIGHT
} from './constants';
import { directionFromVector, projectIsoDirectionToScreen, randomDirection, tryMoveEntity } from './navigation';
import type { DirectionKey, Vec2 } from './types';
import type { DungeonNpcBehavior } from './levelConfig';

type IsoToWorld = (isoX: number, isoY: number) => Vec2;

const NPC_FEET_OFFSET_Y = TILE_HEIGHT * 0.02;
const HEALTH_BAR_WIDTH = 36;
const HEALTH_BAR_HEIGHT = 5;
const HEALTH_BAR_OFFSET_Y = -TILE_HEIGHT * 1.2;
const MAX_HEALTH = 100;
const ENEMY_MOVE_SPEED = 1.8;
const ENEMY_CATCH_DISTANCE = 0.5;

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
	behavior: DungeonNpcBehavior;
	lookAroundTimer: number;
	health: number;
	maxHealth: number;
	healthBarBg: Phaser.GameObjects.Rectangle;
	healthBarFill: Phaser.GameObjects.Rectangle;
	isFrozen: boolean;
	frozenPosition: Vec2 | null;
};

export function spawnNpc(
	scene: Phaser.Scene,
	spawnPosition: Vec2,
	isoToWorld: IsoToWorld,
	isEnemy: boolean,
	behavior: DungeonNpcBehavior
): NpcState {
	const facing: DirectionKey = 'south';
	const world = isoToWorld(spawnPosition.x, spawnPosition.y);
	const sprite = scene.add.image(world.x, world.y + NPC_FEET_OFFSET_Y, DIRECTION_TO_FRAME[facing]);

	sprite.setOrigin(0.5, 1);
	sprite.setScale(PLAYER_SCALE);
	sprite.setDepth(world.y + 9);

	const barWorldY = world.y + HEALTH_BAR_OFFSET_Y;
	const healthBarBg = scene.add.rectangle(
		world.x,
		barWorldY,
		HEALTH_BAR_WIDTH,
		HEALTH_BAR_HEIGHT,
		0xcc0000
	);
	healthBarBg.setOrigin(0.5, 0.5);
	healthBarBg.setDepth(world.y + 10);
	healthBarBg.setVisible(false);

	const healthBarFill = scene.add.rectangle(
		world.x - HEALTH_BAR_WIDTH / 2 + HEALTH_BAR_WIDTH / 2,
		barWorldY,
		HEALTH_BAR_WIDTH,
		HEALTH_BAR_HEIGHT,
		0x2d5a27
	);
	healthBarFill.setOrigin(0.5, 0.5);
	healthBarFill.setDepth(world.y + 11);
	healthBarFill.setVisible(false);

	return {
		gridPos: { ...spawnPosition },
		facing,
		direction: randomDirection(),
		sprite,
		decisionTimer: Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS),
		behavior,
		lookAroundTimer: behavior.kind === 'friendly-stationary-look-around' 
			? Phaser.Math.Between(behavior.lookMinMs, behavior.lookMaxMs) 
			: 0,
		health: isEnemy ? MAX_HEALTH : MAX_HEALTH,
		maxHealth: MAX_HEALTH,
		healthBarBg,
		healthBarFill,
		isFrozen: false,
		frozenPosition: null
	};
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
			npc.facing = npc.behavior.facing;
		}
		return;
	}

	if (npc.behavior.kind === 'friendly-stationary-look-around') {
		npc.lookAroundTimer -= delta;
		if (npc.lookAroundTimer <= 0) {
			const options = LOOK_AROUND_DIRECTIONS.filter((direction) => direction !== npc.facing);
			const nextFacing = options[Phaser.Math.Between(0, options.length - 1)] ?? npc.facing;
			npc.facing = nextFacing;
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

	npc.facing = directionFromVector(projectIsoDirectionToScreen(norm));
}

export function updateEnemyNpcMovement(
	npc: NpcState,
	playerPos: Vec2,
	delta: number,
	collisionMap: number[][],
	worldWidth: number,
	worldHeight: number
) {
	if (npc.isFrozen) {
		return;
	}

	const distToPlayer = Math.hypot(playerPos.x - npc.gridPos.x, playerPos.y - npc.gridPos.y);

	if (distToPlayer <= ENEMY_CATCH_DISTANCE) {
		console.log('[ENEMY DEBUG] Player caught! Freezing NPC at:', npc.gridPos);
		npc.isFrozen = true;
		npc.frozenPosition = { x: npc.gridPos.x, y: npc.gridPos.y };
		return;
	}

	const toPlayer = {
		x: playerPos.x - npc.gridPos.x,
		y: playerPos.y - npc.gridPos.y
	};

	const dist = Math.hypot(toPlayer.x, toPlayer.y);

	if (dist < 0.1) {
		return;
	}

	const norm = {
		x: toPlayer.x / dist,
		y: toPlayer.y / dist
	};

	const distance = (ENEMY_MOVE_SPEED * delta) / 1000;
	const nextX = npc.gridPos.x + norm.x * distance;
	const nextY = npc.gridPos.y + norm.y * distance;

	const tileX = Math.round(nextX);
	const tileY = Math.round(nextY);

	const isBlocked = (tileX < 0 || tileY < 0 || tileX >= worldWidth || tileY >= worldHeight || collisionMap[tileY]?.[tileX] !== 0);

	if (!isBlocked) {
		npc.gridPos.x = nextX;
		npc.gridPos.y = nextY;
		npc.facing = directionFromVector(projectIsoDirectionToScreen(norm));
	} else {
		const canMoveX = collisionMap[Math.round(npc.gridPos.y)]?.[tileX] === 0;
		const canMoveY = collisionMap[tileY]?.[Math.round(npc.gridPos.x)] === 0;

		if (canMoveX) {
			npc.gridPos.x = nextX;
			npc.facing = directionFromVector(projectIsoDirectionToScreen({ x: norm.x, y: 0 }));
		} else if (canMoveY) {
			npc.gridPos.y = nextY;
			npc.facing = directionFromVector(projectIsoDirectionToScreen({ x: 0, y: norm.y }));
		}
	}
}

export function syncNpcSprite(npc: NpcState, isoToWorld: IsoToWorld, showHealthBar: boolean) {
	const world = isoToWorld(npc.gridPos.x, npc.gridPos.y);
	npc.sprite.setPosition(world.x, world.y + NPC_FEET_OFFSET_Y);
	npc.sprite.setDepth(world.y + 9);

	const textureKey = DIRECTION_TO_FRAME[npc.facing] ?? 'penguin-south';
	npc.sprite.setTexture(textureKey);

	const barWorldY = world.y + HEALTH_BAR_OFFSET_Y;
	npc.healthBarBg.setPosition(world.x, barWorldY);
	npc.healthBarBg.setDepth(world.y + 10);
	npc.healthBarFill.setPosition(world.x, barWorldY);
	npc.healthBarFill.setDepth(world.y + 11);

	npc.healthBarBg.setVisible(showHealthBar && npc.health < npc.maxHealth);
	npc.healthBarFill.setVisible(showHealthBar && npc.health < npc.maxHealth);

	if (showHealthBar) {
		const healthPercent = Math.max(0, npc.health / npc.maxHealth);
		const fillWidth = HEALTH_BAR_WIDTH * healthPercent;
		npc.healthBarFill.setSize(fillWidth, HEALTH_BAR_HEIGHT);
		npc.healthBarFill.setX(world.x - HEALTH_BAR_WIDTH / 2 + fillWidth / 2);
	}
}

export function damageEnemy(npc: NpcState, damage: number) {
	npc.health = Math.max(0, npc.health - damage);
}
