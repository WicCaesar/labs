import Phaser from 'phaser';
import {
	FLOOR_COLOR_VARIANTS,
	FLOOR_STROKE_VARIANTS,
	HALF_TILE_HEIGHT,
	HALF_TILE_WIDTH,
	TILE_HEIGHT
} from './constants';
import type { Vec2 } from './types';

export class DungeonRenderer {
	private floorGraphics?: Phaser.GameObjects.Graphics;

	// Walls are split into one Graphics object per tile so each can receive
	// a depth based on its world Y and occlude entities correctly.
	private wallBlocks: Phaser.GameObjects.Graphics[] = [];

	constructor(private readonly scene: Phaser.Scene) {}

	isoToWorld(isoX: number, isoY: number, worldOffsetX: number, worldOffsetY: number): Vec2 {
		return {
			x: worldOffsetX + (isoX - isoY) * HALF_TILE_WIDTH,
			y: worldOffsetY + (isoX + isoY) * HALF_TILE_HEIGHT
		};
	}

	draw(map: number[][], worldOffsetX: number, worldOffsetY: number) {
		if (!this.floorGraphics) {
			this.floorGraphics = this.scene.add.graphics();
		}

		this.floorGraphics.clear();
		for (const wallBlock of this.wallBlocks) {
			wallBlock.destroy();
		}
		this.wallBlocks.length = 0;

		const height = map.length;
		const width = map[0]?.length ?? 0;

		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const world = this.isoToWorld(x, y, worldOffsetX, worldOffsetY);
				const isWall = map[y][x] === 1;

				const colorIndex = (x * 3 + y * 5) % FLOOR_COLOR_VARIANTS.length;
				const floorFill = isWall ? 0x6a5a7d : FLOOR_COLOR_VARIANTS[colorIndex];
				const floorStroke = isWall ? 0x4f4260 : FLOOR_STROKE_VARIANTS[colorIndex];
				this.drawDiamond(this.floorGraphics, world.x, world.y, floorFill, floorStroke);

				if (isWall) {
					const wallBlock = this.scene.add.graphics();
					this.drawWallBlock(wallBlock, world.x, world.y);
					// Depth by world Y simulates painter's algorithm in isometric scenes.
					wallBlock.setDepth(world.y + HALF_TILE_HEIGHT);
					this.wallBlocks.push(wallBlock);
				}
			}
		}

		this.floorGraphics.setDepth(1);
		this.scene.cameras.main.setBackgroundColor('#1b1430');
	}

	private drawDiamond(
		graphics: Phaser.GameObjects.Graphics,
		centerX: number,
		centerY: number,
		fillColor: number,
		strokeColor: number
	) {
		graphics.fillStyle(fillColor, 1);
		graphics.lineStyle(1, strokeColor, 1);
		graphics.beginPath();
		graphics.moveTo(centerX, centerY - HALF_TILE_HEIGHT);
		graphics.lineTo(centerX + HALF_TILE_WIDTH, centerY);
		graphics.lineTo(centerX, centerY + HALF_TILE_HEIGHT);
		graphics.lineTo(centerX - HALF_TILE_WIDTH, centerY);
		graphics.closePath();
		graphics.fillPath();
		graphics.strokePath();
	}

	private drawWallBlock(graphics: Phaser.GameObjects.Graphics, worldX: number, worldY: number) {
		const wallHeight = TILE_HEIGHT;
		const topY = worldY - wallHeight;

		this.drawDiamond(graphics, worldX, topY, 0xc7885a, 0x925d36);

		graphics.fillStyle(0x8f5a7a, 1);
		graphics.lineStyle(1, 0x6a3f59, 0.9);
		graphics.beginPath();
		graphics.moveTo(worldX - HALF_TILE_WIDTH, worldY);
		graphics.lineTo(worldX, worldY + HALF_TILE_HEIGHT);
		graphics.lineTo(worldX, topY + HALF_TILE_HEIGHT);
		graphics.lineTo(worldX - HALF_TILE_WIDTH, topY);
		graphics.closePath();
		graphics.fillPath();
		graphics.strokePath();

		graphics.fillStyle(0x4d8f86, 1);
		graphics.lineStyle(1, 0x35675f, 0.9);
		graphics.beginPath();
		graphics.moveTo(worldX + HALF_TILE_WIDTH, worldY);
		graphics.lineTo(worldX, worldY + HALF_TILE_HEIGHT);
		graphics.lineTo(worldX, topY + HALF_TILE_HEIGHT);
		graphics.lineTo(worldX + HALF_TILE_WIDTH, topY);
		graphics.closePath();
		graphics.fillPath();
		graphics.strokePath();
	}
}