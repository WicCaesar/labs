import Phaser from 'phaser';
import type { CollectibleItem } from '../../shared/types/collectibles';
import type { Vec2 } from './types';
import { TILE_HEIGHT } from './constants';

type IsoToWorld = (isoX: number, isoY: number) => Vec2;

/**
 * Helper module for collectible item management in the dungeon.
 * Handles spawning, collision detection, and visual state.
 */

/**
 * Spawn collectible items in the scene at specified positions.
 * Creates visible text graphics for each item using proper isometric positioning.
 */
export function spawnCollectibles(
	scene: Phaser.Scene,
	collectibles: CollectibleItem[],
	isoToWorld: IsoToWorld
): Map<string, { item: CollectibleItem; graphics: Phaser.GameObjects.Text }> {
	const spawnedItems = new Map<
		string,
		{ item: CollectibleItem; graphics: Phaser.GameObjects.Text }
	>();

	collectibles.forEach(collectible => {
		// Convert grid position to world position using proper isometric transformation
		const world = isoToWorld(collectible.position.x, collectible.position.y);

		// Create text object for the collectible, slightly offset vertically for visual anchoring
		const text = scene.add.text(
			world.x,
			world.y - TILE_HEIGHT * 0.15,
			collectible.text,
			{
				fontFamily: "'Reddit Sans Condensed', Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
				fontSize: '12px',
				fontStyle: 'normal',
				fontWeight: 'bold',
				color: '#fff',
				align: 'center',
				backgroundColor: '#2a2a2a',
				padding: { x: 6, y: 3 },
				stroke: '#4495ff',
				strokeThickness: 2
			}
		);

		text.setOrigin(0.5, 0.5);
		text.setDepth(world.y + 5); // Depth based on isometric Y so items sort correctly

		spawnedItems.set(collectible.id, {
			item: collectible,
			graphics: text
		});
	});

	return spawnedItems;
}

/**
 * Check for overlap between player and collectible items.
 * Returns array of newly collected item IDs.
 */
export function updateCollectibleOverlap(
	playerPosition: Vec2,
	spawnedItems: Map<string, { item: CollectibleItem; graphics: Phaser.GameObjects.Text }>,
	collectedIds: Set<string>
): string[] {
	const newlyCollected: string[] = [];
	const PICKUP_DISTANCE = 0.6; // Tile units (slightly larger than entity collision radius)

	spawnedItems.forEach(({ item }) => {
		if (collectedIds.has(item.id)) {
			return; // Already collected
		}

		const dx = playerPosition.x - item.position.x;
		const dy = playerPosition.y - item.position.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance <= PICKUP_DISTANCE) {
			newlyCollected.push(item.id);
		}
	});

	return newlyCollected;
}

/**
 * Remove a collectible item from the game world.
 * Plays a fade-out animation before destroying the graphics.
 */
export function removeCollectibleFromWorld(
	scene: Phaser.Scene,
	spawnedItems: Map<string, { item: CollectibleItem; graphics: Phaser.GameObjects.Text }>,
	itemId: string
): void {
	const entry = spawnedItems.get(itemId);
	if (!entry) return;

	const { graphics } = entry;

	// Fade out animation
	scene.tweens.add({
		targets: graphics,
		alpha: 0,
		duration: 300,
		ease: 'Quad.easeIn',
		onComplete: () => {
			graphics.destroy();
			spawnedItems.delete(itemId);
		}
	});
}

/**
 * Clean up all collectible items (for level transitions).
 */
export function clearAllCollectibles(
	spawnedItems: Map<string, { item: CollectibleItem; graphics: Phaser.GameObjects.Text }>
): void {
	spawnedItems.forEach(({ graphics }) => {
		graphics.destroy();
	});
	spawnedItems.clear();
}
