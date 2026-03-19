export type DirectionKey =
	| 'north'
	| 'north-east'
	| 'east'
	| 'south-east'
	| 'south'
	| 'south-west'
	| 'west'
	| 'north-west';

// Shared 2D coordinate type used for both grid-space and world-space tuples.
export type Vec2 = { x: number; y: number };