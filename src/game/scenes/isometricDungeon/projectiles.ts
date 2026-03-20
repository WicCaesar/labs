import Phaser from 'phaser';
import { SNOWBALL_COLOR, SNOWBALL_RADIUS, SNOWBALL_WEAPON } from './weapon';
import type { Vec2 } from './types';
import type { NpcState } from './npc';

export interface SnowballProjectile {
	graphics: Phaser.GameObjects.Graphics;
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	progress: number;
	duration: number;
	damage: number;
	active: boolean;
	targetNpc: NpcState | null;
}

export function createSnowballProjectile(
	scene: Phaser.Scene,
	startX: number,
	startY: number,
	targetX: number,
	targetY: number,
	damage: number
): SnowballProjectile {
	const graphics = scene.add.graphics();
	graphics.fillStyle(SNOWBALL_COLOR, 1);
	graphics.fillCircle(0, 0, SNOWBALL_RADIUS);
	graphics.setDepth(100);
	graphics.setPosition(startX, startY);

	return {
		graphics,
		x: startX,
		y: startY,
		targetX,
		targetY,
		progress: 0,
		duration: SNOWBALL_WEAPON.speed * 1000,
		damage,
		active: true,
		targetNpc: null
	};
}

export function updateSnowballProjectile(
	projectile: SnowballProjectile,
	delta: number
): void {
	if (!projectile.active) return;

	projectile.progress += delta / projectile.duration;

	if (projectile.progress >= 1) {
		projectile.progress = 1;
		projectile.active = false;
		projectile.graphics.destroy();
	}

	const t = projectile.progress;
	projectile.x = Phaser.Math.Linear(projectile.x, projectile.targetX, t * 0.1);
	projectile.y = Phaser.Math.Linear(projectile.y, projectile.targetY, t * 0.1);

	projectile.graphics.setPosition(projectile.x, projectile.y);
}

export function fireSnowball(
	scene: Phaser.Scene,
	playerWorldPos: Vec2,
	enemyGridPos: Vec2,
	isoToWorld: (x: number, y: number) => { x: number; y: number }
): SnowballProjectile | null {
	const enemyWorld = isoToWorld(enemyGridPos.x, enemyGridPos.y);
	const dx = enemyWorld.x - playerWorldPos.x;
	const dy = enemyWorld.y - playerWorldPos.y;
	const dist = Math.sqrt(dx * dx + dy * dy);

	if (dist < 1) return null;

	const targetX = playerWorldPos.x + (dx / dist) * SNOWBALL_WEAPON.range * 64;
	const targetY = playerWorldPos.y + (dy / dist) * SNOWBALL_WEAPON.range * 32;

	return createSnowballProjectile(
		scene,
		playerWorldPos.x,
		playerWorldPos.y,
		targetX,
		targetY,
		SNOWBALL_WEAPON.damage
	);
}
