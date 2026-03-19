import Phaser from 'phaser';
import { DIRECTION_TO_FRAME, PLAYER_SCALE, PLAYER_SPEED, TILE_HEIGHT } from './constants';
import { directionFromVector, projectIsoDirectionToScreen, tryMoveEntity } from './navigation';
import type { DirectionKey, Vec2 } from './types';

type IsoToWorld = (isoX: number, isoY: number) => Vec2;

const PLAYER_FEET_OFFSET_Y = TILE_HEIGHT * 0.02;

export type PlayerState = {
	gridPos: Vec2;
	facing: DirectionKey;
	sprite: Phaser.GameObjects.Image;
};

export function spawnPlayer(scene: Phaser.Scene, spawnPosition: Vec2, isoToWorld: IsoToWorld): PlayerState {
	const facing: DirectionKey = 'south';
	const world = isoToWorld(spawnPosition.x, spawnPosition.y);

	const sprite = scene.add.image(world.x, world.y + PLAYER_FEET_OFFSET_Y, DIRECTION_TO_FRAME[facing]);
	sprite.setOrigin(0.5, 1);
	sprite.setScale(PLAYER_SCALE);
	sprite.setDepth(world.y + 10);

	return {
		gridPos: { ...spawnPosition },
		facing,
		sprite
	};
}

export function updatePlayerMovement(
	player: PlayerState,
	move: Vec2,
	delta: number,
	map: number[][],
	worldWidth: number,
	worldHeight: number
) {
	if (move.x === 0 && move.y === 0) {
		return;
	}

	const distance = (PLAYER_SPEED * delta) / 1000;
	const length = Math.hypot(move.x, move.y);
	const norm = {
		x: move.x / length,
		y: move.y / length
	};

	tryMoveEntity(player.gridPos, norm, distance, map, worldWidth, worldHeight);

	// Facing should reflect on-screen direction, not raw grid-space direction.
	const screenDirection = projectIsoDirectionToScreen(norm);
	player.facing = directionFromVector(screenDirection);
	player.sprite.setTexture(DIRECTION_TO_FRAME[player.facing]);
}

export function syncPlayerSprite(player: PlayerState, isoToWorld: IsoToWorld) {
	const world = isoToWorld(player.gridPos.x, player.gridPos.y);
	player.sprite.setPosition(world.x, world.y + PLAYER_FEET_OFFSET_Y);
	player.sprite.setDepth(world.y + 10);
}