import Phaser from 'phaser';
import { RANDOM_DIRECTION_CHOICES } from './constants';
import type { DirectionKey, Vec2 } from './types';

// Radius in tile-space used to keep sprites from visually clipping into blocked cells.
const ENTITY_COLLISION_RADIUS = 0.15;

function isBlockedTile(map: number[][], tileX: number, tileY: number, worldWidth: number, worldHeight: number): boolean {
	if (tileX < 0 || tileY < 0 || tileX >= worldWidth || tileY >= worldHeight) {
		return true;
	}

	return map[tileY][tileX] !== 0;
}

export function isWalkable(map: number[][], x: number, y: number, worldWidth: number, worldHeight: number): boolean {
	// Entity positions are tracked around tile centers (integer coordinates),
	// so we use round-based lookup to keep collision symmetrical around walls.
	const tileX = Math.round(x);
	const tileY = Math.round(y);

	if (isBlockedTile(map, tileX, tileY, worldWidth, worldHeight)) {
		return false;
	}

	if (isBlockedTile(map, tileX - 1, tileY, worldWidth, worldHeight) && x < tileX - 0.5 + ENTITY_COLLISION_RADIUS) {
		return false;
	}

	if (isBlockedTile(map, tileX + 1, tileY, worldWidth, worldHeight) && x > tileX + 0.5 - ENTITY_COLLISION_RADIUS) {
		return false;
	}

	if (isBlockedTile(map, tileX, tileY - 1, worldWidth, worldHeight) && y < tileY - 0.5 + ENTITY_COLLISION_RADIUS) {
		return false;
	}

	if (isBlockedTile(map, tileX, tileY + 1, worldWidth, worldHeight) && y > tileY + 0.5 - ENTITY_COLLISION_RADIUS) {
		return false;
	}

	return true;
}

export function tryMoveEntity(
	position: Vec2,
	direction: Vec2,
	distance: number,
	map: number[][],
	worldWidth: number,
	worldHeight: number
): boolean {
	const startX = position.x;
	const startY = position.y;
	const nextX = startX + direction.x * distance;
	const nextY = startY + direction.y * distance;

	if (isWalkable(map, nextX, nextY, worldWidth, worldHeight)) {
		position.x = nextX;
		position.y = nextY;
		return true;
	}

	// If diagonal movement is blocked, try each axis independently to allow
	// smooth sliding along walls instead of fully stopping.
	const xOnly = startX + direction.x * distance;
	if (isWalkable(map, xOnly, startY, worldWidth, worldHeight)) {
		position.x = xOnly;
	}

	const yOnly = startY + direction.y * distance;
	if (isWalkable(map, position.x, yOnly, worldWidth, worldHeight)) {
		position.y = yOnly;
	}

	return position.x !== startX || position.y !== startY;
}

export function directionFromVector(direction: Vec2): DirectionKey {
	const angle = Phaser.Math.RadToDeg(Math.atan2(direction.y, direction.x));

	if (angle >= -22.5 && angle < 22.5) {
        return 'east';
    }
    if (angle >= 22.5 && angle < 67.5) {
        return 'south-east';
    }
    if (angle >= 67.5 && angle < 112.5) {
        return 'south';
    }
    if (angle >= 112.5 && angle < 157.5) {
        return 'south-west';
    }
    if (angle >= 157.5 || angle < -157.5) {
        return 'west';
    }
    if (angle >= -157.5 && angle < -112.5) {
        return 'north-west';
    }
    if (angle >= -112.5 && angle < -67.5) {
        return 'north';
    }

    return 'north-east';
}

export function findFirstWalkableTile(map: number[][], worldWidth: number, worldHeight: number): Vec2 {
	for (let y = 1; y < worldHeight - 1; y += 1) {
		for (let x = 1; x < worldWidth - 1; x += 1) {
			if (map[y][x] === 0) {
				return { x, y };
			}
		}
	}

	return { x: 1, y: 1 };
}

export function findDistantWalkableTile(
	map: number[][],
	origin: Vec2,
	minDistance: number,
	worldWidth: number,
	worldHeight: number
): Vec2 {
	for (let y = worldHeight - 2; y >= 1; y -= 1) {
		for (let x = worldWidth - 2; x >= 1; x -= 1) {
			if (map[y][x] !== 0) {
				continue;
			}

			const distance = distanceBetween(origin, { x, y });
			if (distance >= minDistance) {
				return { x, y };
			}
		}
	}

	return findFirstWalkableTile(map, worldWidth, worldHeight);
}

export function randomDirection(): Vec2 {
	return RANDOM_DIRECTION_CHOICES[Phaser.Math.Between(0, RANDOM_DIRECTION_CHOICES.length - 1)];
}

export function distanceBetween(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

// Convert a normalized isometric-grid direction into screen-space direction.
// This keeps sprite facing aligned with what players see on screen.
export function projectIsoDirectionToScreen(direction: Vec2): Vec2 {
	return {
		x: direction.x - direction.y,
		y: direction.x + direction.y
	};
}