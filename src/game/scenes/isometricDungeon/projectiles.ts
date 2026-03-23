import Phaser from 'phaser';
import type { NpcState } from './npc';
import type { Vec2 } from './types';

export type SnowballProjectile = {
	graphics: Phaser.GameObjects.Arc;
	originX: number;
	originY: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	speed: number;
	damage: number;
	active: boolean;
	targetNpc?: NpcState;
};

const DEFAULT_SNOWBALL_SPEED = 0.45;
const DEFAULT_SNOWBALL_DAMAGE = 1;
const MAX_TRAVEL_DISTANCE = 900;

export function fireSnowball(
	scene: Phaser.Scene,
	originWorld: Vec2,
	targetGrid: Vec2,
	isoToWorld: (isoX: number, isoY: number) => Vec2
): SnowballProjectile | null {
	const targetWorld = isoToWorld(targetGrid.x, targetGrid.y);
	const dx = targetWorld.x - originWorld.x;
	const dy = targetWorld.y - originWorld.y;
	const magnitude = Math.sqrt(dx * dx + dy * dy);
	if (magnitude <= 0.0001) {
		return null;
	}

	const vx = dx / magnitude;
	const vy = dy / magnitude;
	const graphics = scene.add.circle(originWorld.x, originWorld.y, 6, 0x9fe7ff, 0.95);
	graphics.setStrokeStyle(2, 0xe9f8ff, 0.9);
	graphics.setDepth(originWorld.y + 200);

	return {
		graphics,
		originX: originWorld.x,
		originY: originWorld.y,
		x: originWorld.x,
		y: originWorld.y,
		vx,
		vy,
		speed: DEFAULT_SNOWBALL_SPEED,
		damage: DEFAULT_SNOWBALL_DAMAGE,
		active: true
	};
}

export function updateSnowballProjectile(projectile: SnowballProjectile, deltaMs: number): void {
	if (!projectile.active) {
		return;
	}

	projectile.x += projectile.vx * projectile.speed * deltaMs;
	projectile.y += projectile.vy * projectile.speed * deltaMs;
	projectile.graphics.setPosition(projectile.x, projectile.y);
	projectile.graphics.setDepth(projectile.y + 200);

	const traveledX = projectile.x - projectile.originX;
	const traveledY = projectile.y - projectile.originY;
	const traveledDistance = Math.sqrt(traveledX * traveledX + traveledY * traveledY);
	if (traveledDistance >= MAX_TRAVEL_DISTANCE) {
		projectile.active = false;
		projectile.graphics.destroy();
	}
}
