// Shared scene IDs used by both React bootstrap and Phaser scene registry.
export const SCENE_KEYS = {
	QUIZ_GAME: 'Game',
	ISOMETRIC_DUNGEON: 'IsometricDungeon'
} as const;

export type SceneKey = typeof SCENE_KEYS[keyof typeof SCENE_KEYS];
