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

export type NpcState = {
	gridPos: Vec2;
	facing: DirectionKey;
	direction: Vec2;
	sprite: Phaser.GameObjects.Image;
	decisionTimer: number;
};

export function spawnNpc(scene: Phaser.Scene, spawnPosition: Vec2, isoToWorld: IsoToWorld): NpcState {
	const facing: DirectionKey = 'south';
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
		decisionTimer: Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS)
	};
}

export function updateNpcMovement(
	npc: NpcState,
	delta: number,
	map: number[][],
	worldWidth: number,
	worldHeight: number
) {
	npc.decisionTimer -= delta;
	if (npc.decisionTimer <= 0) {
		// Wander AI picks a fresh random direction at timed intervals.
		npc.direction = randomDirection();
		npc.decisionTimer = Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS);
	}

	if (npc.direction.x === 0 && npc.direction.y === 0) {
		return;
	}

	const length = Math.hypot(npc.direction.x, npc.direction.y);
	const norm = {
		x: npc.direction.x / length,
		y: npc.direction.y / length
	};

	const distance = (NPC_SPEED * delta) / 1000;
	const moved = tryMoveEntity(npc.gridPos, norm, distance, map, worldWidth, worldHeight);

	if (!moved) {
		npc.direction = randomDirection();
		npc.decisionTimer = Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS);
		return;
	}

	npc.facing = directionFromVector(projectIsoDirectionToScreen(norm));
	npc.sprite.setTexture(DIRECTION_TO_FRAME[npc.facing]);
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

	const distance = (NPC_SPEED * 1.15 * delta) / 1000;
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
			npc.facing = directionFromVector(projectIsoDirectionToScreen(fallbackNorm));
			npc.sprite.setTexture(DIRECTION_TO_FRAME[npc.facing]);
		}
		return;
	}

	npc.facing = directionFromVector(projectIsoDirectionToScreen(norm));
	npc.sprite.setTexture(DIRECTION_TO_FRAME[npc.facing]);
}

export function syncNpcSprite(npc: NpcState, isoToWorld: IsoToWorld) {
	const world = isoToWorld(npc.gridPos.x, npc.gridPos.y);
	npc.sprite.setPosition(world.x, world.y + NPC_FEET_OFFSET_Y);
	npc.sprite.setDepth(world.y + 9);
}