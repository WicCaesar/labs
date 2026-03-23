import { distanceBetween } from './navigation';
import { damageEnemy, type NpcState } from './npc';
import { updateSnowballProjectile, type SnowballProjectile } from './projectiles';
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

export function resolveSnowballHits(params: {
	snowballs: SnowballProjectile[];
	delta: number;
	npcs: NpcState[];
	isoToWorld: (x: number, y: number) => { x: number; y: number };
	onAllEnemiesDefeated: () => void;
}): void {
	const { snowballs, delta, npcs, isoToWorld, onAllEnemiesDefeated } = params;

	for (let i = snowballs.length - 1; i >= 0; i--) {
		const snowball = snowballs[i];
		updateSnowballProjectile(snowball, delta);

		if (snowball.active && snowball.targetNpc) {
			const enemyWorld = isoToWorld(snowball.targetNpc.gridPos.x, snowball.targetNpc.gridPos.y);
			const dx = snowball.x - enemyWorld.x;
			const dy = snowball.y - enemyWorld.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist < 20) {
				damageEnemy(snowball.targetNpc, snowball.damage);
				snowball.active = false;
				snowball.graphics.destroy();

				if (snowball.targetNpc.health <= 0) {
					snowball.targetNpc.sprite.destroy();
					snowball.targetNpc.healthBarBg.destroy();
					snowball.targetNpc.healthBarFill.destroy();

					const index = npcs.indexOf(snowball.targetNpc);
					if (index > -1) {
						npcs.splice(index, 1);
					}

					if (npcs.length === 0) {
						onAllEnemiesDefeated();
					}
				}
			}
		}

		if (!snowball.active) {
			snowballs.splice(i, 1);
		}
	}
}
