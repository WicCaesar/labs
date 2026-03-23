import type Phaser from 'phaser';
import type { DirectionKey, Vec2 } from '../types';
import type { NpcState } from '../npc';

export interface WeaponContext {
	scene: Phaser.Scene;
	playerGridPos: Vec2;
	playerWorldPos: Vec2;
	playerFacing: DirectionKey;
	enemies: NpcState[];
	isoToWorld: (x: number, y: number) => Vec2;
	onEnemyKilled: (npc: NpcState) => void;
	onEnemyDamaged: (npc: NpcState) => void;
}

export interface Weapon {
	readonly id: string;
	readonly name: string;
	level: number;

	update(delta: number, ctx: WeaponContext): void;
	destroy(): void;
}
