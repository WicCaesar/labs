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

	private wallTopGraphics?: Phaser.GameObjects.Graphics;

	private wallLeftGraphics?: Phaser.GameObjects.Graphics;

	private wallRightGraphics?: Phaser.GameObjects.Graphics;

	constructor(private readonly scene: Phaser.Scene) {}

	isoToWorld(isoX: number, isoY: number, worldOffsetX: number, worldOffsetY: number): Vec2 {
		return {
			x: worldOffsetX + (isoX - isoY) * HALF_TILE_WIDTH,
			y: worldOffsetY + (isoX + isoY) * HALF_TILE_HEIGHT
		};
	}

	draw(map: number[][], worldOffsetX: number, worldOffsetY: number) {
		if (!this.floorGraphics || !this.wallTopGraphics || !this.wallLeftGraphics || !this.wallRightGraphics) {
			this.floorGraphics = this.scene.add.graphics();
			this.wallTopGraphics = this.scene.add.graphics();
			this.wallLeftGraphics = this.scene.add.graphics();
			this.wallRightGraphics = this.scene.add.graphics();
		}

		this.floorGraphics.clear();
		this.wallTopGraphics.clear();
		this.wallLeftGraphics.clear();
		this.wallRightGraphics.clear();

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
					this.drawWall(world.x, world.y);
				}
			}
		}

		this.floorGraphics.setDepth(1);
		this.wallLeftGraphics.setDepth(3);
		this.wallRightGraphics.setDepth(3);
		this.wallTopGraphics.setDepth(4);
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

	private drawWall(worldX: number, worldY: number) {
		if (!this.wallTopGraphics || !this.wallLeftGraphics || !this.wallRightGraphics) {
			return;
		}

		const wallHeight = TILE_HEIGHT;
		const topY = worldY - wallHeight;

		this.drawDiamond(this.wallTopGraphics, worldX, topY, 0xc7885a, 0x925d36);

		this.wallLeftGraphics.fillStyle(0x8f5a7a, 1);
		this.wallLeftGraphics.lineStyle(1, 0x6a3f59, 0.9);
		this.wallLeftGraphics.beginPath();
		this.wallLeftGraphics.moveTo(worldX - HALF_TILE_WIDTH, worldY);
		this.wallLeftGraphics.lineTo(worldX, worldY + HALF_TILE_HEIGHT);
		this.wallLeftGraphics.lineTo(worldX, topY + HALF_TILE_HEIGHT);
		this.wallLeftGraphics.lineTo(worldX - HALF_TILE_WIDTH, topY);
		this.wallLeftGraphics.closePath();
		this.wallLeftGraphics.fillPath();
		this.wallLeftGraphics.strokePath();

		this.wallRightGraphics.fillStyle(0x4d8f86, 1);
		this.wallRightGraphics.lineStyle(1, 0x35675f, 0.9);
		this.wallRightGraphics.beginPath();
		this.wallRightGraphics.moveTo(worldX + HALF_TILE_WIDTH, worldY);
		this.wallRightGraphics.lineTo(worldX, worldY + HALF_TILE_HEIGHT);
		this.wallRightGraphics.lineTo(worldX, topY + HALF_TILE_HEIGHT);
		this.wallRightGraphics.lineTo(worldX + HALF_TILE_WIDTH, topY);
		this.wallRightGraphics.closePath();
		this.wallRightGraphics.fillPath();
		this.wallRightGraphics.strokePath();
	}
}