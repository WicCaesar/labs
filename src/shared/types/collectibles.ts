import type { Vec2 } from '../../game/scenes/isometricDungeon/types';
import type { DungeonLevelId } from '../../game/scenes/isometricDungeon/levelConfig';

/**
 * Represents a single collectible item in the game world.
 * Players walk through items to collect them.
 */
export type CollectibleItem = {
	// Unique identifier for this item instance
	id: string;
	// The keyword text in uppercase (as displayed in-game)
	text: string;
	// The original-case version for display in the wall of text
	originalCase: string;
	// Index position in the keywords array (for correct placement in fullText)
	keywordIndex: number;
	// Grid position where the item spawns
	position: Vec2;
	// Whether this item has been collected in current session
	collected: boolean;
};

/**
 * Theme metadata and full text for a level.
 * Defines the narrative context and keywords that will be scattered.
 */
export type LevelTheme = {
	// Short title for the theme (e.g. "Cubism")
	themeTitle: string;
	// Full narrative text with [PLACEHOLDER] markers where keywords go
	fullText: string;
	// Array of keywords that fill the placeholders
	keywords: {
		id: string;
		// Uppercase version scattered on the floor
		text: string;
		// Proper-case version for display in reassembled text
		originalCase: string;
	}[];
};

/**
 * Per-level collectible configuration.
 * Includes theme data and spawn positions.
 */
export type LevelCollectibleConfig = LevelTheme & {
	// Collectible item definitions with spawn positions
	spawns: CollectibleItem[];
};

/**
 * Tracks which items have been collected in a level session.
 */
export type CollectibleState = {
	levelId: DungeonLevelId;
	// Set of collected item IDs for quick lookup
	collectedItemIds: Set<string>;
	// Collected items in order (for reference)
	collectedItems: CollectibleItem[];
};
