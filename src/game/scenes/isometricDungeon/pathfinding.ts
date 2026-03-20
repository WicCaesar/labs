import type { Vec2 } from './types';

interface GraphNode {
	x: number;
	y: number;
	g: number;
	h: number;
	f: number;
	parent: GraphNode | null;
}

export type Graph = Record<string, Vec2[]>;

export function buildGraph(map: number[][], worldWidth: number, worldHeight: number): Graph {
	const graph: Graph = {};

	for (let y = 0; y < worldHeight; y++) {
		for (let x = 0; x < worldWidth; x++) {
			if (map[y] === undefined || map[y][x] !== 0) {
				continue;
			}

			const key = `${x},${y}`;
			const neighbors: Vec2[] = [];

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;

					const nx = x + dx;
					const ny = y + dy;

					if (ny >= 0 && ny < worldHeight && nx >= 0 && nx < worldWidth && map[ny] !== undefined && map[ny][nx] === 0) {
						neighbors.push({ x: nx, y: ny });
					}
				}
			}

			graph[key] = neighbors;
		}
	}

	return graph;
}

function heuristic(a: Vec2, b: Vec2): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nodeKey(pos: Vec2): string {
	return `${Math.round(pos.x)},${Math.round(pos.y)}`;
}

export function findPath(graph: Graph, start: Vec2, goal: Vec2): Vec2[] {
	const startKey = nodeKey(start);
	const goalKey = nodeKey(goal);

	if (!graph[startKey] || !graph[goalKey]) {
		return [];
	}

	const openList: GraphNode[] = [];
	const closedSet = new Set<string>();

	const startNode: GraphNode = {
		x: Math.round(start.x),
		y: Math.round(start.y),
		g: 0,
		h: heuristic(start, goal),
		f: heuristic(start, goal),
		parent: null
	};

	openList.push(startNode);

	while (openList.length > 0) {
		openList.sort((a, b) => a.f - b.f);
		const current = openList.shift()!;
		const currentKey = nodeKey(current);

		if (currentKey === goalKey) {
			const path: Vec2[] = [];
			let node: GraphNode | null = current;
			while (node) {
				path.unshift({ x: node.x, y: node.y });
				node = node.parent;
			}
			return path;
		}

		closedSet.add(currentKey);

		const neighbors = graph[currentKey] || [];
		for (const neighbor of neighbors) {
			const neighborKey = nodeKey(neighbor);

			if (closedSet.has(neighborKey)) {
				continue;
			}

			const isDiagonal = Math.abs(neighbor.x - current.x) > 0.1 && Math.abs(neighbor.y - current.y) > 0.1;
			const moveCost = isDiagonal ? 1.414 : 1;
			const tentativeG = current.g + moveCost;

			const existingOpen = openList.find((n) => nodeKey(n) === neighborKey);

			if (!existingOpen) {
				const h = heuristic(neighbor, goal);
				openList.push({
					x: neighbor.x,
					y: neighbor.y,
					g: tentativeG,
					h,
					f: tentativeG + h,
					parent: current
				});
			} else if (tentativeG < existingOpen.g) {
				existingOpen.g = tentativeG;
				existingOpen.f = tentativeG + existingOpen.h;
				existingOpen.parent = current;
			}
		}
	}

	return [];
}

export function rebuildGraphForDynamicMap(
	_existingGraph: Graph,
	collisionMap: number[][],
	worldWidth: number,
	worldHeight: number
): Graph {
	const newGraph: Graph = {};

	for (let y = 0; y < worldHeight; y++) {
		for (let x = 0; x < worldWidth; x++) {
			if (collisionMap[y] === undefined || collisionMap[y][x] !== 0) {
				continue;
			}

			const key = `${x},${y}`;
			const neighbors: Vec2[] = [];

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;

					const nx = x + dx;
					const ny = y + dy;

					if (ny >= 0 && ny < worldHeight && nx >= 0 && nx < worldWidth && collisionMap[ny] !== undefined && collisionMap[ny][nx] === 0) {
						neighbors.push({ x: nx, y: ny });
					}
				}
			}

			newGraph[key] = neighbors;
		}
	}

	return newGraph;
}
