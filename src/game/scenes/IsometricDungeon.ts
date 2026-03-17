import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';
import { EventBus } from '../../shared/events/EventBus';

type DirectionKey =
	| 'north'
	| 'north-east'
	| 'east'
	| 'south-east'
	| 'south'
	| 'south-west'
	| 'west'
	| 'north-west';

type Vec2 = { x: number; y: number };

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const HALF_TILE_WIDTH = TILE_WIDTH / 2;
const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;
const PLAYER_SPEED = 4;
const NPC_SPEED = 2.5;
const PLAYER_SCALE = 1.2;
const WORLD_WIDTH = 16;
const WORLD_HEIGHT = 16;
const NPC_DIRECTION_MIN_MS = 650;
const NPC_DIRECTION_MAX_MS = 1300;
const INTERACTION_DISTANCE = 1.05;

const FLOOR_COLOR_VARIANTS = [0xff7a59, 0x6bcf63, 0x4fc3f7, 0xf6d34f, 0xc084fc];
const FLOOR_STROKE_VARIANTS = [0xd95d3f, 0x4ca548, 0x2e95c7, 0xc2a336, 0x9762ca];

const DIRECTION_TO_FRAME: Readonly<Record<DirectionKey, string>> = {
	north: 'penguin-north',
	'north-east': 'penguin-north-east',
	east: 'penguin-east',
	'south-east': 'penguin-south-east',
	south: 'penguin-south',
	'south-west': 'penguin-south-west',
	west: 'penguin-west',
	'north-west': 'penguin-north-west'
};

export class IsometricDungeon extends Phaser.Scene {
	private readonly map: number[][] = [];

	private playerGridPos: Vec2 = { x: 2, y: 2 };

	private playerFacing: DirectionKey = 'south';

	private playerSprite!: Phaser.GameObjects.Image;

	private npcGridPos: Vec2 = { x: WORLD_WIDTH - 3, y: WORLD_HEIGHT - 3 };

	private npcFacing: DirectionKey = 'south';

	private npcDirection: Vec2 = { x: 0, y: 0 };

	private npcSprite!: Phaser.GameObjects.Image;

	private npcDecisionTimer = 0;

	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

	private wasd!: {
		up: Phaser.Input.Keyboard.Key;
		down: Phaser.Input.Keyboard.Key;
		left: Phaser.Input.Keyboard.Key;
		right: Phaser.Input.Keyboard.Key;
	};

	private interactKey!: Phaser.Input.Keyboard.Key;

	private floorGraphics?: Phaser.GameObjects.Graphics;

	private wallTopGraphics?: Phaser.GameObjects.Graphics;

	private wallLeftGraphics?: Phaser.GameObjects.Graphics;

	private wallRightGraphics?: Phaser.GameObjects.Graphics;

	private statusText!: Phaser.GameObjects.Text;

	private hintText!: Phaser.GameObjects.Text;

	private blueUnlocked = false;

	private worldOffsetX = 0;

	private worldOffsetY = 0;

	constructor() {
		super(SCENE_KEYS.ISOMETRIC_DUNGEON);
	}

	preload() {
		this.load.setPath('assets/sprites/penguin/rotations');
		this.load.image('penguin-north', 'north.png');
		this.load.image('penguin-north-east', 'north-east.png');
		this.load.image('penguin-east', 'east.png');
		this.load.image('penguin-south-east', 'south-east.png');
		this.load.image('penguin-south', 'south.png');
		this.load.image('penguin-south-west', 'south-west.png');
		this.load.image('penguin-west', 'west.png');
		this.load.image('penguin-north-west', 'north-west.png');
	}

	create() {
		this.buildDungeonLayout();

		const mapPixelWidth = (WORLD_WIDTH + WORLD_HEIGHT) * HALF_TILE_WIDTH;
		const mapPixelHeight = (WORLD_WIDTH + WORLD_HEIGHT) * HALF_TILE_HEIGHT;
		this.worldOffsetX = this.scale.width * 0.5;
		this.worldOffsetY = this.scale.height * 0.18;

		this.cameras.main.setBounds(
			this.worldOffsetX - mapPixelWidth * 0.5 - TILE_WIDTH,
			this.worldOffsetY - TILE_HEIGHT,
			mapPixelWidth + TILE_WIDTH * 2,
			mapPixelHeight + TILE_HEIGHT * 3
		);

		this.drawDungeon();
		this.spawnPlayer();
		this.spawnNpc();
		this.createInput();
		this.createHud();
		EventBus.emit('world:color-filter-state-changed', { mode: 'grayscale' });

		this.scale.on('resize', this.handleResize, this);
		this.events.once('shutdown', () => {
			EventBus.emit('world:color-filter-state-changed', { mode: 'none' });
			this.scale.off('resize', this.handleResize, this);
		});
	}

	update(_: number, delta: number) {
		const move = this.getMovementInput();
		if (move.x !== 0 || move.y !== 0) {
			const distance = (PLAYER_SPEED * delta) / 1000;
			const length = Math.hypot(move.x, move.y);
			const norm = {
				x: move.x / length,
				y: move.y / length
			};

			this.tryMoveEntity(this.playerGridPos, norm, distance);
			this.playerFacing = this.directionFromInput(norm);
			this.playerSprite.setTexture(DIRECTION_TO_FRAME[this.playerFacing]);
			this.syncPlayerSprite();
		}

		this.updateNpc(delta);
		this.updateInteractionHint();

		if (
			!this.blueUnlocked
			&& Phaser.Input.Keyboard.JustDown(this.interactKey)
			&& this.distanceBetween(this.playerGridPos, this.npcGridPos) <= INTERACTION_DISTANCE
		) {
			this.unlockBlueChannel();
		}
	}

	private buildDungeonLayout() {
		this.map.length = 0;

		for (let y = 0; y < WORLD_HEIGHT; y += 1) {
			const row: number[] = [];
			for (let x = 0; x < WORLD_WIDTH; x += 1) {
				const isBorder = x === 0 || y === 0 || x === WORLD_WIDTH - 1 || y === WORLD_HEIGHT - 1;
				const isRoomWall = (x === 5 || x === 10) && y > 2 && y < WORLD_HEIGHT - 3;
				const isHorizontalWall = y === 7 && x > 2 && x < WORLD_WIDTH - 3;
				const isPillar = (x === 3 || x === 12) && (y === 4 || y === 11);
				const isDoorGap = (x === 5 && y === 9) || (x === 10 && y === 5) || (x === 8 && y === 7);

				const blocked = (isBorder || isRoomWall || isHorizontalWall || isPillar) && !isDoorGap;
				row.push(blocked ? 1 : 0);
			}
			this.map.push(row);
		}
	}

	private drawDungeon() {
		if (!this.floorGraphics || !this.wallTopGraphics || !this.wallLeftGraphics || !this.wallRightGraphics) {
			this.floorGraphics = this.add.graphics();
			this.wallTopGraphics = this.add.graphics();
			this.wallLeftGraphics = this.add.graphics();
			this.wallRightGraphics = this.add.graphics();
		}

		this.floorGraphics.clear();
		this.wallTopGraphics.clear();
		this.wallLeftGraphics.clear();
		this.wallRightGraphics.clear();

		for (let y = 0; y < WORLD_HEIGHT; y += 1) {
			for (let x = 0; x < WORLD_WIDTH; x += 1) {
				const world = this.isoToWorld(x, y);
				const isWall = this.map[y][x] === 1;

				const colorIndex = (x * 3 + y * 5) % FLOOR_COLOR_VARIANTS.length;
				const floorFill = isWall ? 0x6a5a7d : FLOOR_COLOR_VARIANTS[colorIndex];
				const floorStroke = isWall ? 0x4f4260 : FLOOR_STROKE_VARIANTS[colorIndex];
				this.drawDiamond(this.floorGraphics, world.x, world.y, floorFill, floorStroke);

				if (isWall) {
					const wallHeight = TILE_HEIGHT;
					const topY = world.y - wallHeight;
					this.drawDiamond(this.wallTopGraphics, world.x, topY, 0xc7885a, 0x925d36);

					this.wallLeftGraphics.fillStyle(0x8f5a7a, 1);
					this.wallLeftGraphics.lineStyle(1, 0x6a3f59, 0.9);
					this.wallLeftGraphics.beginPath();
					this.wallLeftGraphics.moveTo(world.x - HALF_TILE_WIDTH, world.y);
					this.wallLeftGraphics.lineTo(world.x, world.y + HALF_TILE_HEIGHT);
					this.wallLeftGraphics.lineTo(world.x, topY + HALF_TILE_HEIGHT);
					this.wallLeftGraphics.lineTo(world.x - HALF_TILE_WIDTH, topY);
					this.wallLeftGraphics.closePath();
					this.wallLeftGraphics.fillPath();
					this.wallLeftGraphics.strokePath();

					this.wallRightGraphics.fillStyle(0x4d8f86, 1);
					this.wallRightGraphics.lineStyle(1, 0x35675f, 0.9);
					this.wallRightGraphics.beginPath();
					this.wallRightGraphics.moveTo(world.x + HALF_TILE_WIDTH, world.y);
					this.wallRightGraphics.lineTo(world.x, world.y + HALF_TILE_HEIGHT);
					this.wallRightGraphics.lineTo(world.x, topY + HALF_TILE_HEIGHT);
					this.wallRightGraphics.lineTo(world.x + HALF_TILE_WIDTH, topY);
					this.wallRightGraphics.closePath();
					this.wallRightGraphics.fillPath();
					this.wallRightGraphics.strokePath();
				}
			}
		}

		this.floorGraphics.setDepth(1);
		this.wallLeftGraphics.setDepth(3);
		this.wallRightGraphics.setDepth(3);
		this.wallTopGraphics.setDepth(4);
		this.cameras.main.setBackgroundColor('#1b1430');
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

	private spawnPlayer() {
		const spawn = this.findFirstWalkableTile();
		this.playerGridPos = spawn;
		const world = this.isoToWorld(spawn.x, spawn.y);

		this.playerSprite = this.add.image(world.x, world.y - TILE_HEIGHT * 0.65, DIRECTION_TO_FRAME[this.playerFacing]);
		this.playerSprite.setOrigin(0.5, 1);
		this.playerSprite.setScale(PLAYER_SCALE);
		this.playerSprite.setDepth(this.playerSprite.y + 10);

		this.cameras.main.centerOn(world.x, world.y);
	}

	private spawnNpc() {
		this.npcGridPos = this.findDistantWalkableTile(5);
		const world = this.isoToWorld(this.npcGridPos.x, this.npcGridPos.y);

		this.npcSprite = this.add.image(world.x, world.y - TILE_HEIGHT * 0.65, DIRECTION_TO_FRAME[this.npcFacing]);
		this.npcSprite.setOrigin(0.5, 1);
		this.npcSprite.setScale(PLAYER_SCALE);
		this.npcSprite.setDepth(world.y + 9);

		this.npcDirection = this.randomDirection();
		this.npcDecisionTimer = Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS);
	}

	private createInput() {
		this.cursors = this.input.keyboard!.createCursorKeys();
		this.wasd = this.input.keyboard!.addKeys({
			up: Phaser.Input.Keyboard.KeyCodes.W,
			down: Phaser.Input.Keyboard.KeyCodes.S,
			left: Phaser.Input.Keyboard.KeyCodes.A,
			right: Phaser.Input.Keyboard.KeyCodes.D
		}) as {
			up: Phaser.Input.Keyboard.Key;
			down: Phaser.Input.Keyboard.Key;
			left: Phaser.Input.Keyboard.Key;
			right: Phaser.Input.Keyboard.Key;
		};

		this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
	}

	private createHud() {
		this.statusText = this.add
			.text(16, 16, 'Dungeon is in grayscale. Find the moving penguin.', {
				fontFamily: 'monospace',
				fontSize: '14px',
				color: '#ffffff',
				backgroundColor: '#111111cc',
				padding: { x: 8, y: 5 }
			})
			.setScrollFactor(0)
			.setDepth(9999);

		this.hintText = this.add
			.text(16, 44, 'Controls: WASD/Arrows + E to interact', {
				fontFamily: 'monospace',
				fontSize: '13px',
				color: '#d5d5d5',
				backgroundColor: '#11111188',
				padding: { x: 8, y: 4 }
			})
			.setScrollFactor(0)
			.setDepth(9999);
	}

	private getMovementInput(): Vec2 {
		const left = this.cursors.left.isDown || this.wasd.left.isDown;
		const right = this.cursors.right.isDown || this.wasd.right.isDown;
		const up = this.cursors.up.isDown || this.wasd.up.isDown;
		const down = this.cursors.down.isDown || this.wasd.down.isDown;

		let x = 0;
		let y = 0;

		if (left) {
			x -= 1;
		}
		if (right) {
			x += 1;
		}
		if (up) {
			y -= 1;
		}
		if (down) {
			y += 1;
		}

		return { x, y };
	}

	private tryMoveEntity(position: Vec2, direction: Vec2, distance: number): boolean {
		const startX = position.x;
		const startY = position.y;
		const nextX = startX + direction.x * distance;
		const nextY = startY + direction.y * distance;

		if (this.isWalkable(nextX, nextY)) {
			position.x = nextX;
			position.y = nextY;
			return true;
		}

		const xOnly = startX + direction.x * distance;
		if (this.isWalkable(xOnly, startY)) {
			position.x = xOnly;
		}

		const yOnly = startY + direction.y * distance;
		if (this.isWalkable(position.x, yOnly)) {
			position.y = yOnly;
		}

		return position.x !== startX || position.y !== startY;
	}

	private isWalkable(x: number, y: number): boolean {
		const tileX = Math.floor(x);
		const tileY = Math.floor(y);

		if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH || tileY >= WORLD_HEIGHT) {
			return false;
		}

		return this.map[tileY][tileX] === 0;
	}

	private directionFromInput(direction: Vec2): DirectionKey {
		const angle = Phaser.Math.RadToDeg(Math.atan2(direction.y, direction.x));

		if (angle >= -22.5 && angle < 22.5) {
			return 'east';
		}
		if (angle >= 22.5 && angle < 67.5) {
			return 'south-east';
		}
		if (angle >= 67.5 && angle < 112.5) {
			return 'south';
		}
		if (angle >= 112.5 && angle < 157.5) {
			return 'south-west';
		}
		if (angle >= 157.5 || angle < -157.5) {
			return 'west';
		}
		if (angle >= -157.5 && angle < -112.5) {
			return 'north-west';
		}
		if (angle >= -112.5 && angle < -67.5) {
			return 'north';
		}

		return 'north-east';
	}

	private syncPlayerSprite() {
		const world = this.isoToWorld(this.playerGridPos.x, this.playerGridPos.y);
		this.playerSprite.setPosition(world.x, world.y - TILE_HEIGHT * 0.65);
		this.playerSprite.setDepth(world.y + 10);
		this.cameras.main.centerOn(world.x, world.y);
	}

	private updateNpc(delta: number) {
		this.npcDecisionTimer -= delta;
		if (this.npcDecisionTimer <= 0) {
			this.npcDirection = this.randomDirection();
			this.npcDecisionTimer = Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS);
		}

		if (this.npcDirection.x === 0 && this.npcDirection.y === 0) {
			return;
		}

		const length = Math.hypot(this.npcDirection.x, this.npcDirection.y);
		const norm = {
			x: this.npcDirection.x / length,
			y: this.npcDirection.y / length
		};

		const distance = (NPC_SPEED * delta) / 1000;
		const moved = this.tryMoveEntity(this.npcGridPos, norm, distance);

		if (moved) {
			this.npcFacing = this.directionFromInput(norm);
			this.npcSprite.setTexture(DIRECTION_TO_FRAME[this.npcFacing]);
			this.syncNpcSprite();
		} else {
			this.npcDirection = this.randomDirection();
			this.npcDecisionTimer = Phaser.Math.Between(NPC_DIRECTION_MIN_MS, NPC_DIRECTION_MAX_MS);
		}
	}

	private updateInteractionHint() {
		if (this.blueUnlocked) {
			this.hintText.setText('Blue restored. Explore and find the next challenge.');
			return;
		}

		const nearNpc = this.distanceBetween(this.playerGridPos, this.npcGridPos) <= INTERACTION_DISTANCE;
		if (nearNpc) {
			this.hintText.setText('Press E to interact with the wandering penguin.');
			return;
		}

		this.hintText.setText('Find the wandering penguin and press E near it.');
	}

	private unlockBlueChannel() {
		if (this.blueUnlocked) {
			return;
		}

		this.blueUnlocked = true;
		EventBus.emit('world:color-filter-state-changed', { mode: 'blue-unlocked' });
		this.statusText.setText('Challenge complete: Blue channel unlocked.');
		this.cameras.main.flash(300, 90, 130, 255);
	}

	private isoToWorld(isoX: number, isoY: number): Vec2 {
		return {
			x: this.worldOffsetX + (isoX - isoY) * HALF_TILE_WIDTH,
			y: this.worldOffsetY + (isoX + isoY) * HALF_TILE_HEIGHT
		};
	}

	private findFirstWalkableTile(): Vec2 {
		for (let y = 1; y < WORLD_HEIGHT - 1; y += 1) {
			for (let x = 1; x < WORLD_WIDTH - 1; x += 1) {
				if (this.map[y][x] === 0) {
					return { x, y };
				}
			}
		}

		return { x: 1, y: 1 };
	}

	private findDistantWalkableTile(minDistance: number): Vec2 {
		for (let y = WORLD_HEIGHT - 2; y >= 1; y -= 1) {
			for (let x = WORLD_WIDTH - 2; x >= 1; x -= 1) {
				if (this.map[y][x] !== 0) {
					continue;
				}

				const distance = this.distanceBetween(this.playerGridPos, { x, y });
				if (distance >= minDistance) {
					return { x, y };
				}
			}
		}

		return this.findFirstWalkableTile();
	}

	private randomDirection(): Vec2 {
		const choices: ReadonlyArray<Vec2> = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: -1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 0, y: -1 },
			{ x: 1, y: 1 },
			{ x: 1, y: -1 },
			{ x: -1, y: 1 },
			{ x: -1, y: -1 }
		];

		return choices[Phaser.Math.Between(0, choices.length - 1)];
	}

	private syncNpcSprite() {
		const world = this.isoToWorld(this.npcGridPos.x, this.npcGridPos.y);
		this.npcSprite.setPosition(world.x, world.y - TILE_HEIGHT * 0.65);
		this.npcSprite.setDepth(world.y + 9);
	}

	private distanceBetween(a: Vec2, b: Vec2): number {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	private handleResize(gameSize: Phaser.Structs.Size) {
		const { width, height } = gameSize;
		this.worldOffsetX = width * 0.5;
		this.worldOffsetY = height * 0.18;
		this.cameras.main.setSize(width, height);
		this.drawDungeon();
		this.syncPlayerSprite();
		this.syncNpcSprite();
	}
}
