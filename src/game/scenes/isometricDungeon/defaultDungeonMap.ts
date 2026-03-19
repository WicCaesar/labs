// Legacy procedural helper kept for quick experiments; gameplay currently uses text maps.
export function buildDefaultDungeonMap(worldWidth: number, worldHeight: number): number[][] {
	const map: number[][] = [];

	for (let y = 0; y < worldHeight; y += 1) {
		const row: number[] = [];
		for (let x = 0; x < worldWidth; x += 1) {
			const isBorder = x === 0 || y === 0 || x === worldWidth - 1 || y === worldHeight - 1;
			const isRoomWall = (x === 5 || x === 10) && y > 2 && y < worldHeight - 3;
			const isHorizontalWall = y === 7 && x > 2 && x < worldWidth - 3;
			const isPillar = (x === 3 || x === 12) && (y === 4 || y === 11);
			const isDoorGap = (x === 5 && y === 9) || (x === 10 && y === 5) || (x === 8 && y === 7);

			const blocked = (isBorder || isRoomWall || isHorizontalWall || isPillar) && !isDoorGap;
			row.push(blocked ? 1 : 0);
		}
		map.push(row);
	}

	return map;
}