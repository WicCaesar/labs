export function buildSecondDungeonMap(worldWidth: number, worldHeight: number): number[][] {
	const map: number[][] = [];

	for (let y = 0; y < worldHeight; y += 1) {
		const row: number[] = [];
		for (let x = 0; x < worldWidth; x += 1) {
			const isBorder = x === 0 || y === 0 || x === worldWidth - 1 || y === worldHeight - 1;
			const isVerticalMaze = (x % 3 === 0) && y > 1 && y < worldHeight - 2;
			const isHorizontalMaze = (y === 5 || y === 10) && x > 2 && x < worldWidth - 3;
			const isCrossCore = (x === 7 || x === 8) && y > 3 && y < worldHeight - 4;
			const isGate =
				(x === 3 && y === 4)
				|| (x === 6 && y === 8)
				|| (x === 9 && y === 6)
				|| (x === 12 && y === 11)
				|| (x === 8 && y === 10);

			const blocked = (isBorder || isVerticalMaze || isHorizontalMaze || isCrossCore) && !isGate;
			row.push(blocked ? 1 : 0);
		}
		map.push(row);
	}

	return map;
}