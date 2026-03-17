import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';
import { EventBus } from '../../shared/events/EventBus';
import { DungeonRenderer } from './isometricDungeon/DungeonRenderer';
import { INTERACTION_DISTANCE, TILE_HEIGHT, TILE_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from './isometricDungeon/constants';
import {
	createLevelConfig,
	DUNGEON_LEVEL,
	type DungeonHudState,
	type DungeonLevelConfig,
	type DungeonLevelId,
	type DungeonState
} from './isometricDungeon/levelConfig';
import { distanceBetween, isWalkable } from './isometricDungeon/navigation';
import type { Vec2 } from './isometricDungeon/types';
import { spawnNpc, syncNpcSprite, type NpcState, updateEnemyNpcMovement, updateNpcMovement } from './isometricDungeon/npc';
import { spawnPlayer, syncPlayerSprite, type PlayerState, updatePlayerMovement } from './isometricDungeon/player';

export class IsometricDungeon extends Phaser.Scene {
	private readonly map: number[][] = [];

	private levels!: Record<DungeonLevelId, DungeonLevelConfig>;

	private currentLevel: DungeonLevelId = DUNGEON_LEVEL.ONE;

	private state: DungeonState = 'level-one-hunt-blue';

	private dungeonRenderer!: DungeonRenderer;

	private player!: PlayerState;

	private npc!: NpcState;

	private exitMarker?: Phaser.GameObjects.Ellipse;

	private level2RespawnPoint: Vec2 = { x: 2, y: WORLD_HEIGHT - 3 };

	private lastPlayerHitAt = 0;

	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

	private wasd!: {
		up: Phaser.Input.Keyboard.Key;
		down: Phaser.Input.Keyboard.Key;
		left: Phaser.Input.Keyboard.Key;
		right: Phaser.Input.Keyboard.Key;
	};

	private interactKey!: Phaser.Input.Keyboard.Key;

	private blueUnlocked = false;

	private redUnlocked = false;

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
		this.dungeonRenderer = new DungeonRenderer(this);
		this.levels = createLevelConfig(WORLD_WIDTH, WORLD_HEIGHT);
		this.loadLevel(DUNGEON_LEVEL.ONE, true);

		const mapPixelWidth = (WORLD_WIDTH + WORLD_HEIGHT) * (TILE_WIDTH / 2);
		const mapPixelHeight = (WORLD_WIDTH + WORLD_HEIGHT) * (TILE_HEIGHT / 2);
		this.worldOffsetX = this.scale.width * 0.5;
		this.worldOffsetY = this.scale.height * 0.18;

		this.cameras.main.setBounds(
			this.worldOffsetX - mapPixelWidth * 0.5 - TILE_WIDTH,
			this.worldOffsetY - TILE_HEIGHT,
			mapPixelWidth + TILE_WIDTH * 2,
			mapPixelHeight + TILE_HEIGHT * 3
		);

		this.drawDungeon();
		this.spawnActorsForLevel();
		this.createInput();
		this.createLevelMarker();
		EventBus.emit('world:color-filter-state-changed', { mode: 'grayscale' });
		this.publishHudState();

		this.scale.on('resize', this.handleResize, this);
		this.events.once('shutdown', () => {
			this.emitHudState({
				level: 1,
				state: 'complete',
				status: '',
				hint: '',
				objective: '',
				canInteract: false
			});
			EventBus.emit('world:color-filter-state-changed', { mode: 'none' });
			this.scale.off('resize', this.handleResize, this);
		});
	}

	update(_: number, delta: number) {
		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		const move = this.getMovementInput();
		updatePlayerMovement(this.player, move, delta, this.map, WORLD_WIDTH, WORLD_HEIGHT);
		syncPlayerSprite(this.player, isoToWorld);
		const playerWorld = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(playerWorld.x, playerWorld.y);

		if (this.state === 'level-two-hunt-red' && !this.redUnlocked) {
			updateEnemyNpcMovement(this.npc, this.player.gridPos, delta, this.map, WORLD_WIDTH, WORLD_HEIGHT);
			this.handleEnemyTouchDamage();
		} else {
			updateNpcMovement(this.npc, delta, this.map, WORLD_WIDTH, WORLD_HEIGHT);
		}

		syncNpcSprite(this.npc, isoToWorld);

		if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
			this.handleInteraction();
		}

		this.publishHudState();
	}

	private loadLevel(levelId: DungeonLevelId, isInitialLoad = false) {
		this.currentLevel = levelId;
		const level = this.levels[levelId];
		const map = level.map;
		this.map.length = 0;
		this.map.push(...map);

		if (levelId === DUNGEON_LEVEL.ONE) {
			this.state = this.blueUnlocked ? 'level-one-blue-unlocked' : 'level-one-hunt-blue';
		} else {
			this.state = this.redUnlocked ? 'complete' : 'level-two-hunt-red';
			this.level2RespawnPoint = { ...level.playerSpawn };
		}

		if (!isInitialLoad) {
			this.drawDungeon();
			this.updateLevelMarker();
			this.spawnActorsForLevel();
		}
	}

	private drawDungeon() {
		this.dungeonRenderer.draw(this.map, this.worldOffsetX, this.worldOffsetY);
	}

	private spawnActorsForLevel() {
		const level = this.levels[this.currentLevel];
		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);

		if (this.player && this.player.sprite) {
			this.player.sprite.destroy();
		}
		if (this.npc && this.npc.sprite) {
			this.npc.sprite.destroy();
		}

		const spawn = this.ensureWalkable(level.playerSpawn);
		this.player = spawnPlayer(this, spawn, isoToWorld);
		const world = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(world.x, world.y);

		const npcSpawn = this.ensureWalkable(level.npcSpawn);
		this.npc = spawnNpc(this, npcSpawn, isoToWorld);
		this.npc.sprite.setVisible(!this.redUnlocked || this.currentLevel === DUNGEON_LEVEL.ONE);
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

	private handleInteraction() {
		if (this.state === 'level-one-hunt-blue') {
			const canDescend = this.isNearLevelExit();
			if (canDescend) {
				this.transitionToSecondLevel();
				return;
			}

			const nearNpc = distanceBetween(this.player.gridPos, this.npc.gridPos) <= INTERACTION_DISTANCE;
			if (nearNpc) {
				this.unlockBlueChannel();
			}
			return;
		}

		if (this.state === 'level-one-blue-unlocked') {
			const canDescend = this.isNearLevelExit();
			if (canDescend) {
				this.transitionToSecondLevel();
				return;
			}
		}

		if (this.state === 'level-two-hunt-red' && !this.redUnlocked) {
			const nearEnemy = distanceBetween(this.player.gridPos, this.npc.gridPos) <= INTERACTION_DISTANCE;
			if (nearEnemy) {
				this.killEnemyUnlockRed();
			}
		}
	}

	private unlockBlueChannel() {
		if (this.blueUnlocked) {
			return;
		}

		this.blueUnlocked = true;
		this.state = 'level-one-blue-unlocked';
		EventBus.emit('world:color-filter-state-changed', { mode: 'blue-unlocked' });
		this.cameras.main.flash(300, 90, 130, 255);
	}

	private transitionToSecondLevel() {
		this.cameras.main.fadeOut(260, 20, 20, 30);
		this.time.delayedCall(280, () => {
			this.loadLevel(DUNGEON_LEVEL.TWO);
			this.cameras.main.fadeIn(260, 20, 20, 30);
		});
	}

	private killEnemyUnlockRed() {
		if (this.redUnlocked) {
			return;
		}

		this.redUnlocked = true;
		this.state = 'complete';
		this.npc.sprite.setVisible(false);
		EventBus.emit('world:color-filter-state-changed', { mode: 'red-unlocked' });
		this.cameras.main.flash(380, 255, 90, 90);
	}

	private handleEnemyTouchDamage() {
		if (this.redUnlocked) {
			return;
		}

		const nearEnemy = distanceBetween(this.player.gridPos, this.npc.gridPos) <= 0.75;
		const now = this.time.now;
		if (!nearEnemy || now - this.lastPlayerHitAt < 1250) {
			return;
		}

		this.lastPlayerHitAt = now;
		this.player.gridPos = { ...this.level2RespawnPoint };
		syncPlayerSprite(this.player, (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY));
		this.cameras.main.shake(140, 0.008);
	}

	private ensureWalkable(tile: Vec2): Vec2 {
		if (isWalkable(this.map, tile.x, tile.y, WORLD_WIDTH, WORLD_HEIGHT)) {
			return tile;
		}

		for (let y = 1; y < WORLD_HEIGHT - 1; y += 1) {
			for (let x = 1; x < WORLD_WIDTH - 1; x += 1) {
				if (isWalkable(this.map, x, y, WORLD_WIDTH, WORLD_HEIGHT)) {
					return { x, y };
				}
			}
		}

		return { x: 1, y: 1 };
	}

	private createLevelMarker() {
		this.exitMarker = this.add.ellipse(0, 0, 26, 14, 0x0b0b0b, 0.8).setDepth(8);
		this.updateLevelMarker();
	}

	private updateLevelMarker() {
		if (!this.exitMarker) {
			return;
		}

		const level = this.levels[this.currentLevel];
		if (!level.exitTile) {
			this.exitMarker.setVisible(false);
			return;
		}

		const world = this.isoToWorld(level.exitTile.x + 0.5, level.exitTile.y + 0.5);
		this.exitMarker.setVisible(true);
		this.exitMarker.setPosition(world.x, world.y - TILE_HEIGHT * 0.16);
		this.exitMarker.setFillStyle(this.blueUnlocked ? 0x111111 : 0x2c2c2c, this.blueUnlocked ? 0.88 : 0.58);
		this.exitMarker.setDepth(world.y + 8);
	}

	private isNearLevelExit(): boolean {
		const level = this.levels[this.currentLevel];
		if (!level.exitTile) {
			return false;
		}

		const exitCenter = {
			x: level.exitTile.x + 0.5,
			y: level.exitTile.y + 0.5
		};

		return distanceBetween(this.player.gridPos, exitCenter) <= 1.1;
	}

	private publishHudState() {
		const nearNpc = distanceBetween(this.player.gridPos, this.npc.gridPos) <= INTERACTION_DISTANCE;
		const nearExit = this.isNearLevelExit();

		if (this.state === 'level-one-hunt-blue') {
			this.emitHudState({
				level: 1,
				state: this.state,
				status: 'Dungeon is in grayscale. Blue is optional for this run.',
				hint: nearExit
					? 'Press E to descend now, or talk to the penguin first to unlock blue.'
					: nearNpc
						? 'Press E to unlock blue, or head to the hole to skip blue.'
						: 'Find the center hole to descend, or find the penguin to unlock blue first.',
				objective: 'Optional: unlock blue. Main path: descend to level 2.',
				canInteract: nearNpc || nearExit
			});
			return;
		}

		if (this.state === 'level-one-blue-unlocked') {
			this.emitHudState({
				level: 1,
				state: this.state,
				status: 'Blue restored. The descent hole is now active.',
				hint: nearExit
					? 'Press E to descend to the next level.'
					: 'Find the dark hole near the center of the dungeon.',
				objective: 'Descend to level 2.',
				canInteract: nearExit
			});
			return;
		}

		if (this.state === 'level-two-hunt-red') {
			this.emitHudState({
				level: 2,
				state: this.state,
				status: 'The penguin is hostile now. Stay mobile.',
				hint: nearNpc
					? 'Press E near the enemy penguin to strike and finish it.'
					: 'Avoid contact. Close in only when you are ready to attack.',
				objective: 'Defeat the enemy penguin to unlock red.',
				canInteract: nearNpc
			});
			return;
		}

		this.emitHudState({
			level: 2,
			state: 'complete',
			status: 'Challenge complete: red channel unlocked.',
			hint: 'All primary colors recovered. Explore freely.',
			objective: 'Completed.',
			canInteract: false
		});
	}

	private emitHudState(payload: DungeonHudState) {
		EventBus.emit('dungeon:hud-state-changed', payload);
	}

	private isoToWorld(isoX: number, isoY: number): Vec2 {
		return this.dungeonRenderer.isoToWorld(isoX, isoY, this.worldOffsetX, this.worldOffsetY);
	}

	private handleResize(gameSize: Phaser.Structs.Size) {
		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		const { width, height } = gameSize;
		this.worldOffsetX = width * 0.5;
		this.worldOffsetY = height * 0.18;
		this.cameras.main.setSize(width, height);
		this.drawDungeon();
		this.updateLevelMarker();
		syncPlayerSprite(this.player, isoToWorld);
		syncNpcSprite(this.npc, isoToWorld);
	}
}
