import Phaser from 'phaser';
import {
	DIRECTION_TO_FRAME,
	NPC_DIRECTION_MIN_MS,
	NPC_DIRECTION_MAX_MS,
	PLAYER_SCALE,
	TILE_HEIGHT
} from './constants';
import { directionFromVector, projectIsoDirectionToScreen, randomDirection, tryMoveEntity } from './navigation';
import { buildGraph, findPath, type Graph } from './pathfinding';
import type { DirectionKey, Vec2 } from './types';

type IsoToWorld = (isoX: number, isoY: number) => Vec2;

const NPC_FEET_OFFSET_Y = TILE_HEIGHT * 0.02;
const ENEMY_SPEED = 2.5;
const HEALTH_BAR_WIDTH = 36;
const HEALTH_BAR_HEIGHT = 5;
const HEALTH_BAR_OFFSET_Y = -TILE_HEIGHT * 1.2;
const MAX_HEALTH = 100;
const PATH_RECALC_INTERVAL = 500;
const WAYPOINT_THRESHOLD = 0.25;

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
	health: number;
	maxHealth: number;
	healthBarBg: Phaser.GameObjects.Rectangle;
	healthBarFill: Phaser.GameObjects.Rectangle;
	graph: Graph;
	path: Vec2[];
	pathIndex: number;
	pathRecalcTimer: number;
};

export function spawnNpc(
	scene: Phaser.Scene,
	spawnPosition: Vec2,
	isoToWorld: IsoToWorld,
	isEnemy: boolean
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
		health: isEnemy ? MAX_HEALTH : MAX_HEALTH,
		maxHealth: MAX_HEALTH,
		healthBarBg,
		healthBarFill,
		graph: {},
		path: [],
		pathIndex: 0,
		pathRecalcTimer: 0
	};
}

export function initializeEnemyGraph(npc: NpcState, map: number[][], worldWidth: number, worldHeight: number) {
	npc.graph = buildGraph(map, worldWidth, worldHeight);
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

	const distance = (ENEMY_SPEED * delta) / 1000;
	const moved = tryMoveEntity(npc.gridPos, norm, distance, map, worldWidth, worldHeight);

	if (!moved) {
		npc.direction = randomDirection();
		npc.decisionTimer = Phaser.Math.Between(decisionMinMs, decisionMaxMs);
		return;
	}

	setNpcFacing(npc, directionFromVector(projectIsoDirectionToScreen(norm)));
}

function getNextWaypoint(npc: NpcState): Vec2 | null {
	while (npc.pathIndex < npc.path.length) {
		const waypoint = npc.path[npc.pathIndex];
		const dx = waypoint.x - npc.gridPos.x;
		const dy = waypoint.y - npc.gridPos.y;
		const dist = Math.hypot(dx, dy);

		if (dist < WAYPOINT_THRESHOLD) {
			npc.pathIndex++;
		} else {
			return waypoint;
		}
	}
	return null;
}

export function updateEnemyNpcMovement(
	npc: NpcState,
	playerPos: Vec2,
	delta: number,
	map: number[][],
	worldWidth: number,
	worldHeight: number
) {
	npc.pathRecalcTimer -= delta;

	if (npc.pathRecalcTimer <= 0 || npc.path.length === 0) {
		const start = { x: Math.round(npc.gridPos.x), y: Math.round(npc.gridPos.y) };
		const goal = { x: Math.round(playerPos.x), y: Math.round(playerPos.y) };
		npc.path = findPath(npc.graph, start, goal);
		npc.pathIndex = 0;
		npc.pathRecalcTimer = PATH_RECALC_INTERVAL;
	}

	const target = getNextWaypoint(npc);

	if (!target) {
		return;
	}

	const toTarget = {
		x: target.x - npc.gridPos.x,
		y: target.y - npc.gridPos.y
	};

	const dist = Math.hypot(toTarget.x, toTarget.y);
	if (dist < 0.001) {
		return;
	}

	const norm = {
		x: toTarget.x / dist,
		y: toTarget.y / dist
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

export function syncNpcSprite(npc: NpcState, isoToWorld: IsoToWorld, showHealthBar: boolean) {
	const world = isoToWorld(npc.gridPos.x, npc.gridPos.y);
	npc.sprite.setPosition(world.x, world.y + NPC_FEET_OFFSET_Y);
	npc.sprite.setDepth(world.y + 9);

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
