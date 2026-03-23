import { distanceBetween } from './navigation';
import type { NpcState } from './npc';
import type { Vec2 } from './types';

export function findNearestEnemy(enemies: NpcState[], playerPos: Vec2): NpcState | null {
	let nearest: NpcState | null = null;
	let minDist = Infinity;

	for (const enemy of enemies) {
		const dist = distanceBetween(playerPos, enemy.gridPos);
		if (dist < minDist) {
			minDist = dist;
			nearest = enemy;
		}
	}

	return nearest;
}

export function isEnemyInRange(playerPos: Vec2, enemy: NpcState, maxRange = 3): boolean {
	const dist = distanceBetween(playerPos, enemy.gridPos);
	return dist <= maxRange;
}
