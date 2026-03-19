import type Phaser from 'phaser';
import { TILE_HEIGHT } from './constants';
import type { DirectionKey, Vec2 } from './types';

export type PushBlockKind = 'step' | 'slide';

export type PushBlockState = {
	id: string;
	kind: PushBlockKind;
	position: Vec2;
	sprite: Phaser.GameObjects.Rectangle;
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

export const getPushDeltaFromFacing = (facing: DirectionKey): Vec2 => FACING_TO_ISO_DELTA[facing];

export function spawnPushBlock(
	scene: Phaser.Scene,
	kind: PushBlockKind,
	position: Vec2,
	isoToWorld: IsoToWorld,
	id: string
): PushBlockState {
	const world = isoToWorld(position.x + 0.5, position.y + 0.5);
	const fillColor = kind === 'slide' ? 0xf9a825 : 0x607d8b;
	const sprite = scene.add.rectangle(world.x, world.y - TILE_HEIGHT * 0.4, 20, 20, fillColor, 0.96);
	sprite.setStrokeStyle(2, 0x141414, 0.95);
	sprite.setDepth(world.y + 9);

	return {
		id,
		kind,
		position: { ...position },
		sprite
	};
}

export function syncPushBlockSprite(block: PushBlockState, isoToWorld: IsoToWorld) {
	const world = isoToWorld(block.position.x + 0.5, block.position.y + 0.5);
	block.sprite.setPosition(world.x, world.y - TILE_HEIGHT * 0.4);
	block.sprite.setDepth(world.y + 9);
}

export function findPushBlockAtTile(blocks: PushBlockState[], tileX: number, tileY: number): PushBlockState | null {
	for (const block of blocks) {
		if (block.position.x === tileX && block.position.y === tileY) {
			return block;
		}
	}

	return null;
}
