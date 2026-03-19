import type Phaser from 'phaser';
import { HALF_TILE_HEIGHT, HALF_TILE_WIDTH, TILE_HEIGHT } from './constants';
import type { DirectionKey, Vec2 } from './types';

export type PushBlockKind = 'step' | 'slide';

export type PushBlockState = {
	id: string;
	kind: PushBlockKind;
	position: Vec2;
	sprite: Phaser.GameObjects.Graphics;
};

type IsoToWorld = (isoX: number, isoY: number) => Vec2;

const FACING_TO_ISO_DELTA: Record<DirectionKey, Vec2> = {
	north: { x: -1, y: -1 },
	'north-east': { x: 0, y: -1 },
	east: { x: 1, y: -1 },
	'south-east': { x: 1, y: 0 },
	south: { x: 1, y: 1 },
	'south-west': { x: 0, y: 1 },
	west: { x: -1, y: 1 },
	'north-west': { x: -1, y: 0 }
};

// Keep block depth tied to its base world Y so actors behind it get occluded.
const PUSH_BLOCK_DEPTH_OFFSET = HALF_TILE_HEIGHT;

export const getPushDeltaFromFacing = (facing: DirectionKey): Vec2 => FACING_TO_ISO_DELTA[facing];

export function spawnPushBlock(
	scene: Phaser.Scene,
	kind: PushBlockKind,
	position: Vec2,
	isoToWorld: IsoToWorld,
	id: string
): PushBlockState {
	const world = isoToWorld(position.x, position.y);
	const sprite = scene.add.graphics();
	drawObstacleStyleBlock(sprite, world.x, world.y, kind);
	sprite.setDepth(world.y + PUSH_BLOCK_DEPTH_OFFSET);

	return {
		id,
		kind,
		position: { ...position },
		sprite
	};
}

export function syncPushBlockSprite(block: PushBlockState, isoToWorld: IsoToWorld) {
	const world = isoToWorld(block.position.x, block.position.y);
	block.sprite.clear();
	drawObstacleStyleBlock(block.sprite, world.x, world.y, block.kind);
	block.sprite.setDepth(world.y + PUSH_BLOCK_DEPTH_OFFSET);
}

function drawObstacleStyleBlock(graphics: Phaser.GameObjects.Graphics, worldX: number, worldY: number, kind: PushBlockKind) {
	const topY = worldY - TILE_HEIGHT;

	// Match obstacle wall top color/stroke from dungeon renderer.
	graphics.fillStyle(0xc7885a, 1);
	graphics.lineStyle(1, 0x925d36, 1);
	graphics.beginPath();
	graphics.moveTo(worldX, topY - HALF_TILE_HEIGHT);
	graphics.lineTo(worldX + HALF_TILE_WIDTH, topY);
	graphics.lineTo(worldX, topY + HALF_TILE_HEIGHT);
	graphics.lineTo(worldX - HALF_TILE_WIDTH, topY);
	graphics.closePath();
	graphics.fillPath();
	graphics.strokePath();

	graphics.fillStyle(0x8f5a7a, 1);
	graphics.lineStyle(1, 0x6a3f59, 0.9);
	graphics.beginPath();
	graphics.moveTo(worldX - HALF_TILE_WIDTH, worldY);
	graphics.lineTo(worldX, worldY + HALF_TILE_HEIGHT);
	graphics.lineTo(worldX, topY + HALF_TILE_HEIGHT);
	graphics.lineTo(worldX - HALF_TILE_WIDTH, topY);
	graphics.closePath();
	graphics.fillPath();
	graphics.strokePath();

	graphics.fillStyle(0x4d8f86, 1);
	graphics.lineStyle(1, 0x35675f, 0.9);
	graphics.beginPath();
	graphics.moveTo(worldX + HALF_TILE_WIDTH, worldY);
	graphics.lineTo(worldX, worldY + HALF_TILE_HEIGHT);
	graphics.lineTo(worldX, topY + HALF_TILE_HEIGHT);
	graphics.lineTo(worldX + HALF_TILE_WIDTH, topY);
	graphics.closePath();
	graphics.fillPath();
	graphics.strokePath();

	// Visual convention:
	// - step block: one line
	// - slide block: two parallel lines
	graphics.lineStyle(2, 0xf6d34f, 0.95);
	if (kind === 'step') {
		drawVerticalTopMarkerLine(graphics, worldX, topY);
		return;
	}

	drawVerticalTopMarkerLine(graphics, worldX - HALF_TILE_WIDTH * 0.14, topY);
	drawVerticalTopMarkerLine(graphics, worldX + HALF_TILE_WIDTH * 0.14, topY);
}

function drawVerticalTopMarkerLine(graphics: Phaser.GameObjects.Graphics, x: number, topY: number) {
	graphics.beginPath();
	graphics.moveTo(x, topY - HALF_TILE_HEIGHT * 0.34);
	graphics.lineTo(x, topY + HALF_TILE_HEIGHT * 0.34);
	graphics.strokePath();
}

export function findPushBlockAtTile(blocks: PushBlockState[], tileX: number, tileY: number): PushBlockState | null {
	for (const block of blocks) {
		if (block.position.x === tileX && block.position.y === tileY) {
			return block;
		}
	}

	return null;
}
