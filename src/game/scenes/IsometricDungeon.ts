import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';
import { EventBus } from '../../shared/events/EventBus';
import type { WorldColorFilterMode } from '../../shared/events/EventBus';
import { DungeonRenderer } from './isometricDungeon/DungeonRenderer';
import { INTERACTION_DISTANCE, TILE_HEIGHT, TILE_WIDTH } from './isometricDungeon/constants';
import {
	findPushBlockAtTile,
	getPushDeltaFromFacing,
	spawnPushBlock,
	syncPushBlockSprite,
	type PushBlockState
} from './isometricDungeon/pushBlocks';
import {
	createLevelConfig,
	DUNGEON_LEVEL,
	type DungeonHudState,
	type DungeonInteractableMarker,
	type DungeonLevelConfig,
	type DungeonLevelId,
	type DungeonState
} from './isometricDungeon/levelConfig';
import type { DungeonMarker } from './isometricDungeon/dungeonMapParser';
import { distanceBetween, isWalkable } from './isometricDungeon/navigation';
import type { Vec2 } from './isometricDungeon/types';
import { spawnNpc, syncNpcSprite, type NpcState, updateEnemyNpcMovement, updateNpcMovement } from './isometricDungeon/npc';
import { spawnPlayer, syncPlayerSprite, type PlayerState, updatePlayerMovement } from './isometricDungeon/player';

export class IsometricDungeon extends Phaser.Scene {
	private readonly map: number[][] = [];

	private readonly collisionMap: number[][] = [];

	private levels!: Record<DungeonLevelId, DungeonLevelConfig>;

	private currentLevel: DungeonLevelId = DUNGEON_LEVEL.ONE;

	private state: DungeonState = 'level-one-hunt-blue';

	private dungeonRenderer!: DungeonRenderer;

	private player!: PlayerState;

	private npc: NpcState | null = null;

	private exitMarkerOuter?: Phaser.GameObjects.Ellipse;

	private exitMarkerInner?: Phaser.GameObjects.Ellipse;

	private markerVisuals: Phaser.GameObjects.Ellipse[] = [];

	private buttonVisuals: Phaser.GameObjects.Container[] = [];

	private readonly pushBlocks: PushBlockState[] = [];

	private readonly activatedInteractableKeys = new Set<string>();

	private readonly pressedButtonKeys = new Set<string>();

	private readonly exitUnlockedByLevel = new Map<DungeonLevelId, boolean>();

	private exitSparkleTimer: Phaser.Time.TimerEvent | null = null;

	private level2RespawnPoint: Vec2 = { x: 2, y: 2 };

	private mapWidth = 0;

	private mapHeight = 0;

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

	private yellowUnlocked = false;

	private isDungeonQuizActive = false;

	private activeDungeonQuizId: 'blue' | 'yellow' | null = null;

	private lastBlueQuizCorrectAnswers = 0;

	private lastYellowQuizCorrectAnswers = 0;

	private readonly blueQuizQuestionCount = 3;

	private readonly yellowQuizQuestionCount = 3;

	private readonly unsubscribeHandlers: Array<() => void> = [];

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
		this.levels = createLevelConfig();
		this.loadLevel(DUNGEON_LEVEL.ONE, true);
		this.worldOffsetX = this.scale.width * 0.5;
		this.worldOffsetY = this.scale.height * 0.18;
		this.updateCameraBoundsForCurrentMap();

		this.drawDungeon();
		this.spawnActorsForLevel();
		this.createInput();
		this.createLevelMarker();
		this.unsubscribeHandlers.push(
			EventBus.on('ui:dungeon-quiz-finished', ({ quizId, passed, correctAnswers }) => {
				this.handleDungeonQuizFinished(quizId, passed, correctAnswers);
			}),
			EventBus.on('ui:dungeon-quiz-cancelled', ({ quizId }) => {
				this.handleDungeonQuizCancelled(quizId);
			})
		);
		this.emitWorldColorFilterState();
		this.publishHudState();

		this.scale.on('resize', this.handleResize, this);
		this.events.once('shutdown', () => {
			this.stopExitSparkleLoop();
			this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
			this.unsubscribeHandlers.length = 0;
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
		if (this.isDungeonQuizActive) {
			this.publishHudState();
			return;
		}

		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		const move = this.getMovementInput();
		this.rebuildCollisionMap();
		updatePlayerMovement(this.player, move, delta, this.collisionMap, this.mapWidth, this.mapHeight);
		syncPlayerSprite(this.player, isoToWorld);
		const playerWorld = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(playerWorld.x, playerWorld.y);

		const levelNpcRole = this.levels[this.currentLevel].npcRole;
		if (this.npc) {
			const isEnemyLevel = levelNpcRole === 'enemy';
			if (this.state === 'level-two-hunt-red' && !this.redUnlocked && isEnemyLevel) {
				updateEnemyNpcMovement(this.npc, this.player.gridPos, delta, this.collisionMap, this.mapWidth, this.mapHeight);
				this.handleEnemyTouchDamage();
			} else {
				updateNpcMovement(this.npc, delta, this.collisionMap, this.mapWidth, this.mapHeight);
			}

			syncNpcSprite(this.npc, isoToWorld);
		}

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
		this.mapWidth = level.mapWidth;
		this.mapHeight = level.mapHeight;

		if (levelId === DUNGEON_LEVEL.ONE) {
			this.state = this.blueUnlocked ? 'level-one-blue-unlocked' : 'level-one-hunt-blue';
		} else if (levelId === DUNGEON_LEVEL.TWO) {
			this.state = this.redUnlocked ? 'level-two-red-unlocked' : 'level-two-hunt-red';
			this.level2RespawnPoint = { ...level.playerSpawn };
		} else if (levelId === DUNGEON_LEVEL.THREE) {
			this.state = this.yellowUnlocked ? 'level-three-yellow-unlocked' : 'level-three-hunt-yellow';
		} else {
			this.state = 'level-four-button-puzzle';
		}

		if (!isInitialLoad) {
			this.updateCameraBoundsForCurrentMap();
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
		this.npc = null;
		this.pushBlocks.forEach((block) => block.sprite.destroy());
		this.pushBlocks.length = 0;

		const spawn = this.ensureWalkable(level.playerSpawn);
		this.player = spawnPlayer(this, spawn, isoToWorld);
		const world = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(world.x, world.y);

		if (level.npcSpawn && level.npcRole && level.npcBehavior) {
			const npcSpawn = this.ensureWalkable(level.npcSpawn);
			this.npc = spawnNpc(this, npcSpawn, isoToWorld, level.npcBehavior);
			const hideDefeatedEnemyNpc = this.currentLevel === DUNGEON_LEVEL.TWO && this.redUnlocked;
			this.npc.sprite.setVisible(!hideDefeatedEnemyNpc);
		}

		for (const [index, spawn] of level.pushBlocks.entries()) {
			const blockId = `${this.currentLevel}-${spawn.kind}-${spawn.position.x}-${spawn.position.y}-${index}`;
			this.pushBlocks.push(spawnPushBlock(this, spawn.kind, spawn.position, isoToWorld, blockId));
		}
		this.rebuildCollisionMap();
		this.refreshButtonActivation(false);
		this.renderInteractableMarkers();
		this.renderButtonMarkers();
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

		// Convert keyboard intent from screen space into isometric grid deltas.
		// This keeps controls intuitive: W = up on screen, D = right on screen, etc.
		const screenX = (right ? 1 : 0) - (left ? 1 : 0);
		const screenY = (down ? 1 : 0) - (up ? 1 : 0);

		return {
			x: screenX + screenY,
			y: screenY - screenX
		};
	}

	private handleInteraction() {
		if (this.tryPushBlockInFacingDirection()) {
			return;
		}

		if (this.state === 'level-one-hunt-blue') {
			const canDescend = this.isNearLevelExit();
			if (canDescend) {
				this.transitionToSecondLevel();
				return;
			}

			const nearNpc = this.isPlayerNearNpc();
			if (nearNpc) {
				this.startBlueUnlockQuiz();
				return;
			}

			this.tryActivateNearbyInteractable();
			return;
		}

		if (this.state === 'level-one-blue-unlocked') {
			const canDescend = this.isNearLevelExit();
			if (canDescend) {
				this.transitionToSecondLevel();
				return;
			}

			this.tryActivateNearbyInteractable();
			return;
		}

		if (this.state === 'level-two-hunt-red' && !this.redUnlocked) {
			const nearEnemy = this.isPlayerNearNpc();
			if (nearEnemy) {
				this.killEnemyUnlockRed();
				return;
			}

			this.tryActivateNearbyInteractable();
			return;
		}

		if (this.state === 'level-two-red-unlocked') {
			const canDescend = this.isNearLevelExit();
			if (canDescend) {
				this.transitionToThirdLevel();
				return;
			}

			this.tryActivateNearbyInteractable();
			return;
		}

		if (this.state === 'level-three-hunt-yellow') {
			const nearNpc = this.isPlayerNearNpc();
			if (nearNpc) {
				this.startYellowUnlockQuiz();
				return;
			}

			this.tryActivateNearbyInteractable();
			return;
		}

		if (this.state === 'level-three-yellow-unlocked') {
			const canDescend = this.isNearLevelExit();
			if (canDescend) {
				this.transitionToFourthLevel();
				return;
			}

			this.tryActivateNearbyInteractable();
			return;
		}

		if (this.state === 'level-four-button-puzzle') {
			const nearExit = this.isNearLevelExit();
			if (nearExit) {
				if (this.areAllButtonsPressed()) {
					this.completeFourthLevel();
				} else {
					EventBus.emit('dungeon:interactable-activated', {
						level: this.currentLevel,
						type: 'button',
						position: { ...this.levels[this.currentLevel].exitTile! },
						message: 'The gate is sealed. Press every floor button with push blocks.',
						durationMs: 2200
					});
				}
				return;
			}

			this.tryActivateNearbyInteractable();
			return;
		}

		this.tryActivateNearbyInteractable();
	}

	private unlockBlueChannel() {
		if (this.blueUnlocked) {
			return;
		}

		this.blueUnlocked = true;
		this.state = 'level-one-blue-unlocked';
		this.emitWorldColorFilterState();
		this.cameras.main.flash(300, 90, 130, 255);
	}

	private startBlueUnlockQuiz() {
		if (this.blueUnlocked || this.isDungeonQuizActive || this.currentLevel !== DUNGEON_LEVEL.ONE || !this.npc) {
			return;
		}

		this.isDungeonQuizActive = true;
		this.activeDungeonQuizId = 'blue';
		this.lastBlueQuizCorrectAnswers = 0;
		EventBus.emit('dungeon:quiz-requested', {
			quizId: 'blue',
			segment: 1,
			questionCount: this.blueQuizQuestionCount
		});
	}

	private startYellowUnlockQuiz() {
		if (this.yellowUnlocked || this.isDungeonQuizActive || this.currentLevel !== DUNGEON_LEVEL.THREE || !this.npc) {
			return;
		}

		this.isDungeonQuizActive = true;
		this.activeDungeonQuizId = 'yellow';
		this.lastYellowQuizCorrectAnswers = 0;
		EventBus.emit('dungeon:quiz-requested', {
			quizId: 'yellow',
			segment: 2,
			questionCount: this.yellowQuizQuestionCount
		});
	}

	private handleDungeonQuizFinished(quizId: 'blue' | 'yellow', passed: boolean, correctAnswers: number) {
		if (!this.isDungeonQuizActive || this.activeDungeonQuizId !== quizId) {
			return;
		}

		this.isDungeonQuizActive = false;
		this.activeDungeonQuizId = null;

		if (quizId === 'blue') {
			if (this.currentLevel !== DUNGEON_LEVEL.ONE || this.blueUnlocked) {
				return;
			}

			this.lastBlueQuizCorrectAnswers = correctAnswers;
			if (passed) {
				this.unlockBlueChannel();
				return;
			}

			this.cameras.main.shake(130, 0.006);
			return;
		}

		if (this.currentLevel !== DUNGEON_LEVEL.THREE || this.yellowUnlocked) {
			return;
		}

		this.lastYellowQuizCorrectAnswers = correctAnswers;
		if (passed) {
			this.unlockYellowChannel();
			return;
		}

		this.cameras.main.shake(130, 0.006);
	}

	private handleDungeonQuizCancelled(quizId: 'blue' | 'yellow') {
		if (!this.isDungeonQuizActive || this.activeDungeonQuizId !== quizId) {
			return;
		}

		this.isDungeonQuizActive = false;
		this.activeDungeonQuizId = null;
	}

	private transitionToSecondLevel() {
		this.cameras.main.fadeOut(260, 20, 20, 30);
		this.time.delayedCall(280, () => {
			this.loadLevel(DUNGEON_LEVEL.TWO);
			this.cameras.main.fadeIn(260, 20, 20, 30);
		});
	}

	private killEnemyUnlockRed() {
		if (this.redUnlocked || !this.npc) {
			return;
		}

		this.redUnlocked = true;
		this.state = 'level-two-red-unlocked';
		this.npc.sprite.setVisible(false);
		this.emitWorldColorFilterState();
		this.cameras.main.flash(380, 255, 90, 90);
		this.updateLevelMarker();
	}

	private unlockYellowChannel() {
		if (this.yellowUnlocked) {
			return;
		}

		this.yellowUnlocked = true;
		this.state = 'level-three-yellow-unlocked';
		this.emitWorldColorFilterState();
		this.cameras.main.flash(420, 120, 255, 120);
		this.updateLevelMarker();
	}

	private emitWorldColorFilterState() {
		EventBus.emit('world:color-filter-state-changed', {
			mode: this.getWorldColorFilterMode()
		});
	}

	private getWorldColorFilterMode(): WorldColorFilterMode {
		const red = this.redUnlocked;
		// The yellow quiz restores the green RGB channel for additive color mixing.
		const green = this.yellowUnlocked;
		const blue = this.blueUnlocked;

		// Order matters: we resolve 3-channel first, then 2-channel combinations,
		// then single-channel states, finally grayscale fallback.
		if (red && green && blue) {
			return 'none';
		}

		if (red && green) {
			return 'red-green-unlocked';
		}

		if (red && blue) {
			return 'red-blue-unlocked';
		}

		if (green && blue) {
			return 'green-blue-unlocked';
		}

		if (red) {
			return 'red-unlocked';
		}

		if (green) {
			return 'green-unlocked';
		}

		if (blue) {
			return 'blue-unlocked';
		}

		return 'grayscale';
	}

	private transitionToThirdLevel() {
		this.cameras.main.fadeOut(260, 20, 20, 30);
		this.time.delayedCall(280, () => {
			this.loadLevel(DUNGEON_LEVEL.THREE);
			this.cameras.main.fadeIn(260, 20, 20, 30);
		});
	}

	private transitionToFourthLevel() {
		this.cameras.main.fadeOut(260, 20, 20, 30);
		this.time.delayedCall(280, () => {
			this.loadLevel(DUNGEON_LEVEL.FOUR);
			this.cameras.main.fadeIn(260, 20, 20, 30);
		});
	}

	private completeFourthLevel() {
		if (this.state === 'complete') {
			return;
		}

		this.state = 'complete';
		this.cameras.main.flash(420, 255, 220, 120);
		EventBus.emit('dungeon:interactable-activated', {
			level: this.currentLevel,
			type: 'button',
			position: { ...this.levels[this.currentLevel].exitTile! },
			message: 'All buttons activated. The dungeon challenge is complete.',
			durationMs: 2200
		});
		this.updateLevelMarker();
	}

	private handleEnemyTouchDamage() {
		if (this.redUnlocked || !this.npc) {
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

	private rebuildCollisionMap() {
		this.collisionMap.length = 0;
		for (let y = 0; y < this.mapHeight; y += 1) {
			this.collisionMap.push([...this.map[y]]);
		}

		// Push blocks are dynamic blockers layered on top of static wall map data.
		for (const block of this.pushBlocks) {
			if (block.position.y < 0 || block.position.y >= this.mapHeight || block.position.x < 0 || block.position.x >= this.mapWidth) {
				continue;
			}

			this.collisionMap[block.position.y][block.position.x] = 1;
		}
	}

	private getRoundedPlayerTile(): Vec2 {
		return {
			x: Math.round(this.player.gridPos.x),
			y: Math.round(this.player.gridPos.y)
		};
	}

	private isTileInsideMap(tileX: number, tileY: number): boolean {
		return tileX >= 0 && tileY >= 0 && tileX < this.mapWidth && tileY < this.mapHeight;
	}

	private isTileBlockedForPush(tileX: number, tileY: number, ignoredBlockId?: string): boolean {
		if (!this.isTileInsideMap(tileX, tileY)) {
			return true;
		}

		if (this.map[tileY][tileX] === 1) {
			return true;
		}

		for (const block of this.pushBlocks) {
			if (block.id === ignoredBlockId) {
				continue;
			}

			if (block.position.x === tileX && block.position.y === tileY) {
				return true;
			}
		}

		if (this.npc && this.npc.sprite.visible) {
			const npcTile = {
				x: Math.round(this.npc.gridPos.x),
				y: Math.round(this.npc.gridPos.y)
			};
			if (npcTile.x === tileX && npcTile.y === tileY) {
				return true;
			}
		}

		const level = this.levels[this.currentLevel];
		if (level.exitTile && level.exitTile.x === tileX && level.exitTile.y === tileY) {
			return true;
		}

		for (const marker of level.markers) {
			if (marker.type === 'button') {
				continue;
			}

			if (marker.position.x === tileX && marker.position.y === tileY) {
				return true;
			}
		}

		return false;
	}

	private tryPushBlockInFacingDirection(): boolean {
		if (this.pushBlocks.length === 0) {
			return false;
		}

		const playerTile = this.getRoundedPlayerTile();
		const pushDelta = getPushDeltaFromFacing(this.player.facing);
		const frontTile = {
			x: playerTile.x + pushDelta.x,
			y: playerTile.y + pushDelta.y
		};

		const block = findPushBlockAtTile(this.pushBlocks, frontTile.x, frontTile.y);
		if (!block) {
			return false;
		}

		let destination: Vec2 | null = null;
		if (block.kind === 'step') {
			// Step blocks move exactly one tile.
			const nextTile = {
				x: block.position.x + pushDelta.x,
				y: block.position.y + pushDelta.y
			};

			if (!this.isTileBlockedForPush(nextTile.x, nextTile.y, block.id)) {
				destination = nextTile;
			}
		} else {
			// Slide blocks keep traveling until the next tile would be blocked.
			let cursor = { ...block.position };
			while (true) {
				const nextTile = {
					x: cursor.x + pushDelta.x,
					y: cursor.y + pushDelta.y
				};

				if (this.isTileBlockedForPush(nextTile.x, nextTile.y, block.id)) {
					break;
				}

				cursor = nextTile;
			}

			if (cursor.x !== block.position.x || cursor.y !== block.position.y) {
				destination = cursor;
			}
		}

		if (!destination) {
			EventBus.emit('dungeon:interactable-activated', {
				level: this.currentLevel,
				type: 'push-block',
				position: { ...block.position },
				message: 'The block cannot move in that direction.',
				durationMs: 1700
			});
			return true;
		}

		block.position = destination;
		syncPushBlockSprite(block, (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY));
		this.rebuildCollisionMap();
		this.refreshButtonActivation(true);

		EventBus.emit('dungeon:interactable-activated', {
			level: this.currentLevel,
			type: 'push-block',
			position: { ...destination },
			message: block.kind === 'slide'
				? 'Sliding block moved until collision.'
				: 'Block pushed one tile.',
			durationMs: 1700
		});

		return true;
	}

	private isFacingPushableBlock(): boolean {
		const playerTile = this.getRoundedPlayerTile();
		const pushDelta = getPushDeltaFromFacing(this.player.facing);
		return findPushBlockAtTile(this.pushBlocks, playerTile.x + pushDelta.x, playerTile.y + pushDelta.y) !== null;
	}

	private ensureWalkable(tile: Vec2): Vec2 {
		if (isWalkable(this.map, tile.x, tile.y, this.mapWidth, this.mapHeight)) {
			return tile;
		}

		for (let y = 1; y < this.mapHeight - 1; y += 1) {
			for (let x = 1; x < this.mapWidth - 1; x += 1) {
				if (isWalkable(this.map, x, y, this.mapWidth, this.mapHeight)) {
					return { x, y };
				}
			}
		}

		return { x: 1, y: 1 };
	}

	private createLevelMarker() {
		this.exitMarkerOuter = this.add.ellipse(0, 0, 30, 16, 0x2f3b45, 0.9).setDepth(8);
		this.exitMarkerInner = this.add.ellipse(0, 0, 22, 11, 0x06080b, 0.96).setDepth(8.1);
		this.updateLevelMarker();
	}

	private renderInteractableMarkers() {
		this.markerVisuals.forEach((visual) => visual.destroy());
		this.markerVisuals.length = 0;

		const level = this.levels[this.currentLevel];
		for (const marker of level.markers) {
			if (marker.type !== 'interactable') {
				continue;
			}

			const world = this.isoToWorld(marker.position.x + 0.5, marker.position.y + 0.5);
			const isActive = this.activatedInteractableKeys.has(this.getMarkerKey(this.currentLevel, marker));
			const visual = this.add.ellipse(
				world.x,
				world.y - TILE_HEIGHT * 0.1,
				20,
				12,
				isActive ? 0x43a047 : 0x1f7fbf,
				isActive ? 0.45 : 0.8
			);
			visual.setDepth(world.y + 7);
			this.markerVisuals.push(visual);
		}
	}

	private renderButtonMarkers() {
		this.buttonVisuals.forEach((visual) => visual.destroy());
		this.buttonVisuals.length = 0;

		for (const marker of this.getButtonMarkers()) {
			const world = this.isoToWorld(marker.position.x, marker.position.y);
			const pressed = this.isButtonPressed(marker);
			const buttonY = world.y;
			const plate = this.add.ellipse(0, 0, 24, 12, 0x303841, 0.95);
			const ring = this.add.ellipse(0, 0, 18, 9, 0x868f98, 0.95);
			const cap = this.add.ellipse(
				0,
				pressed ? 1.2 : -1.0,
				12,
				6,
				pressed ? 0x42a55a : 0xc17f3b,
				0.96
			);
			const shine = this.add.ellipse(
				-2.2,
				pressed ? 0.2 : -2.1,
				4,
				2,
				0xffffff,
				pressed ? 0.2 : 0.35
			);

			const visual = this.add.container(world.x, buttonY, [plate, ring, cap, shine]);
			visual.setDepth(world.y + 6.6);
			this.buttonVisuals.push(visual);
		}
	}

	private getButtonMarkers(): Array<Extract<DungeonMarker, { type: 'button' }>> {
		return this.levels[this.currentLevel].markers.filter((marker) => marker.type === 'button');
	}

	private isButtonPressed(marker: Extract<DungeonMarker, { type: 'button' }>): boolean {
		const key = this.getMarkerKey(this.currentLevel, marker);
		return this.pressedButtonKeys.has(key);
	}

	private refreshButtonActivation(emitEvents: boolean) {
		const nextPressedKeys = new Set<string>();
		for (const marker of this.getButtonMarkers()) {
			const hasBlock = findPushBlockAtTile(this.pushBlocks, marker.position.x, marker.position.y) !== null;
			if (hasBlock) {
				nextPressedKeys.add(this.getMarkerKey(this.currentLevel, marker));
			}
		}

		if (emitEvents) {
			for (const marker of this.getButtonMarkers()) {
				const key = this.getMarkerKey(this.currentLevel, marker);
				const wasPressed = this.pressedButtonKeys.has(key);
				const isPressed = nextPressedKeys.has(key);
				if (wasPressed === isPressed) {
					continue;
				}

				EventBus.emit('dungeon:interactable-activated', {
					level: this.currentLevel,
					type: 'button',
					position: marker.position,
					message: isPressed
						? `Button pressed at (${marker.position.x}, ${marker.position.y}).`
						: `Button released at (${marker.position.x}, ${marker.position.y}).`,
					durationMs: 1800
				});
			}
		}

		this.pressedButtonKeys.clear();
		nextPressedKeys.forEach((key) => this.pressedButtonKeys.add(key));
		this.renderButtonMarkers();

		if (this.currentLevel === DUNGEON_LEVEL.FOUR) {
			if (this.state !== 'complete') {
				this.state = 'level-four-button-puzzle';
			}
			this.updateLevelMarker();
		}
	}

	private areAllButtonsPressed(): boolean {
		const buttons = this.getButtonMarkers();
		return buttons.length > 0 && this.pressedButtonKeys.size === buttons.length;
	}

	private getNearestInteractable(): DungeonInteractableMarker | null {
		const level = this.levels[this.currentLevel];
		let nearest: DungeonInteractableMarker | null = null;
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (const marker of level.markers) {
			if (marker.type !== 'interactable') {
				continue;
			}

			const markerCenter = {
				x: marker.position.x + 0.5,
				y: marker.position.y + 0.5
			};
			const distance = distanceBetween(this.player.gridPos, markerCenter);
			if (distance < nearestDistance) {
				nearest = marker;
				nearestDistance = distance;
			}
		}

		if (!nearest || nearestDistance > 1.1) {
			return null;
		}

		return nearest;
	}

	private getMarkerKey(levelId: DungeonLevelId, marker: Pick<DungeonMarker, 'type' | 'position'>): string {
		return `${levelId}:${marker.type}:${marker.position.x}:${marker.position.y}`;
	}

	private tryActivateNearbyInteractable() {
		const marker = this.getNearestInteractable();
		if (!marker) {
			return;
		}

		const markerKey = this.getMarkerKey(this.currentLevel, marker);
		const alreadyActivated = this.activatedInteractableKeys.has(markerKey);
		if (!alreadyActivated) {
			this.activatedInteractableKeys.add(markerKey);
			this.renderInteractableMarkers();
			this.cameras.main.flash(140, 90, 190, 255);
		}

		EventBus.emit('dungeon:interactable-activated', {
			level: this.currentLevel,
			type: marker.type,
			position: marker.position,
			message: alreadyActivated
				? `Interactable revisited at (${marker.position.x}, ${marker.position.y}).`
				: `Interacted with marker at (${marker.position.x}, ${marker.position.y}).`,
			durationMs: 2400
		});
	}

	private updateLevelMarker() {
		if (!this.exitMarkerOuter || !this.exitMarkerInner) {
			return;
		}

		const level = this.levels[this.currentLevel];
		if (!level.exitTile) {
			this.stopExitSparkleLoop();
			this.exitMarkerOuter.setVisible(false);
			this.exitMarkerInner.setVisible(false);
			return;
		}

		const world = this.isoToWorld(level.exitTile.x, level.exitTile.y);
		const exitAvailable =
			(this.currentLevel === DUNGEON_LEVEL.ONE)
			|| (this.currentLevel === DUNGEON_LEVEL.TWO && this.redUnlocked)
			|| (this.currentLevel === DUNGEON_LEVEL.THREE && this.yellowUnlocked)
			|| (this.currentLevel === DUNGEON_LEVEL.FOUR && this.areAllButtonsPressed());
		const markerY = world.y;
		const wasUnlocked = this.exitUnlockedByLevel.get(this.currentLevel) ?? false;
		if (exitAvailable && !wasUnlocked) {
			this.spawnExitUnlockSparkles(world);
			this.startExitSparkleLoop();
		} else if (exitAvailable) {
			this.startExitSparkleLoop();
		} else {
			this.stopExitSparkleLoop();
		}
		this.exitUnlockedByLevel.set(this.currentLevel, exitAvailable);

		this.exitMarkerOuter.setVisible(true);
		this.exitMarkerInner.setVisible(true);
		this.exitMarkerOuter.setPosition(world.x, markerY);
		this.exitMarkerInner.setPosition(world.x, markerY + (exitAvailable ? 0.5 : 0));
		this.exitMarkerOuter.setFillStyle(exitAvailable ? 0x3b4a56 : 0x2b343c, exitAvailable ? 0.94 : 0.84);
		this.exitMarkerInner.setFillStyle(exitAvailable ? 0x0d1218 : 0x171d23, exitAvailable ? 0.98 : 0.94);
		this.exitMarkerOuter.setDepth(world.y + 7.9);
		this.exitMarkerInner.setDepth(world.y + 8);
	}

	private spawnExitUnlockSparkles(world: Vec2) {
		this.spawnExitSparklesAt(world, 14, true);
		this.cameras.main.flash(180, 120, 220, 255, false);
	}

	private spawnExitSparklesAt(world: Vec2, sparkleCount: number, strongBurst: boolean) {
		const sparkleColors = [0xff4fc3, 0x4fd8ff, 0xffe066, 0x7dff7d, 0xff8a65];

		for (let index = 0; index < sparkleCount; index += 1) {
			const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
			const radius = Phaser.Math.Between(strongBurst ? 10 : 6, strongBurst ? 24 : 14);
			const targetX = world.x + Math.cos(angle) * radius;
			const targetY = world.y + Math.sin(angle) * (radius * 0.42) - Phaser.Math.Between(8, strongBurst ? 20 : 14);
			const sparkle = this.add.circle(
				world.x + Phaser.Math.Between(-2, 2),
				world.y + Phaser.Math.Between(-2, 2),
				Phaser.Math.FloatBetween(strongBurst ? 1.8 : 1.2, strongBurst ? 3.2 : 2.3),
				sparkleColors[index % sparkleColors.length],
				strongBurst ? 0.95 : 0.8
			);
			sparkle.setDepth(world.y + 9.5);

			this.tweens.add({
				targets: sparkle,
				x: targetX,
				y: targetY,
				alpha: 0,
				scale: 0.15,
				duration: Phaser.Math.Between(strongBurst ? 480 : 380, strongBurst ? 760 : 620),
				ease: 'Cubic.easeOut',
				onComplete: () => sparkle.destroy()
			});
		}
	}

	private startExitSparkleLoop() {
		if (this.exitSparkleTimer) {
			return;
		}

		this.exitSparkleTimer = this.time.addEvent({
			delay: 260,
			loop: true,
			callback: () => {
				const level = this.levels[this.currentLevel];
				if (!level.exitTile) {
					return;
				}

				const exitAvailable =
					(this.currentLevel === DUNGEON_LEVEL.ONE)
					|| (this.currentLevel === DUNGEON_LEVEL.TWO && this.redUnlocked)
					|| (this.currentLevel === DUNGEON_LEVEL.THREE && this.yellowUnlocked)
					|| (this.currentLevel === DUNGEON_LEVEL.FOUR && this.areAllButtonsPressed());
				if (!exitAvailable) {
					return;
				}

				const world = this.isoToWorld(level.exitTile.x, level.exitTile.y);
				this.spawnExitSparklesAt(world, Phaser.Math.Between(2, 4), false);
			}
		});
	}

	private stopExitSparkleLoop() {
		if (this.exitSparkleTimer) {
			this.exitSparkleTimer.remove(false);
			this.exitSparkleTimer = null;
		}
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

	private isPlayerNearNpc(): boolean {
		if (!this.npc) {
			return false;
		}

		return distanceBetween(this.player.gridPos, this.npc.gridPos) <= INTERACTION_DISTANCE;
	}

	private publishHudState() {
		const nearNpc = this.isPlayerNearNpc();
		const nearExit = this.isNearLevelExit();
		const nearInteractable = this.getNearestInteractable() !== null;
		const canPushFacingBlock = this.isFacingPushableBlock();

		if (this.state === 'level-one-hunt-blue') {
			if (this.isDungeonQuizActive && this.activeDungeonQuizId === 'blue') {
				this.emitHudState({
					level: 1,
					state: this.state,
					status: 'Quiz in progress: answer 3 questions to restore blue.',
					hint: 'Complete the quiz overlay with keyboard or pointer. ESC closes the quiz.',
					objective: 'Pass the 3-question quiz to unlock blue.',
					canInteract: false
				});
				return;
			}

			this.emitHudState({
				level: 1,
				state: this.state,
				status: 'Dungeon is in grayscale. Talk to the penguin to start the blue quiz.',
				hint: nearExit
					? 'Press E to descend now, or press E near the penguin to take the blue quiz first.'
					: canPushFacingBlock
						? 'Press E to push the block in front of you.'
					: nearNpc
						? 'Press E to start a 3-question quiz. You must score 3/3 to unlock blue.'
						: nearInteractable
							? 'Press E near the marker to inspect it.'
						: this.lastBlueQuizCorrectAnswers > 0
							? `Last quiz score: ${this.lastBlueQuizCorrectAnswers}/3. Talk to the penguin to retry.`
							: 'Find the center hole to descend, or find the penguin and pass the quiz to unlock blue.',
				objective: 'Optional: pass a 3-question quiz to unlock blue. Main path: descend to level 2.',
				canInteract: nearNpc || nearExit || nearInteractable || canPushFacingBlock
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
					: canPushFacingBlock
						? 'Press E to push the block in front of you.'
					: nearInteractable
						? 'Press E near the marker to inspect it.'
					: 'Find the dark hole near the center of the dungeon.',
				objective: 'Descend to level 2.',
				canInteract: nearExit || nearInteractable || canPushFacingBlock
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
					: canPushFacingBlock
						? 'Press E to push the block in front of you and open a safer path.'
					: nearInteractable
						? 'Press E near the marker to inspect it while avoiding the enemy.'
					: 'Avoid contact. Close in only when you are ready to attack.',
				objective: 'Defeat the enemy penguin to unlock red.',
				canInteract: nearNpc || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-two-red-unlocked') {
			this.emitHudState({
				level: 2,
				state: this.state,
				status: 'Red restored. The next stairs are now active.',
				hint: nearExit
					? 'Press E to descend to level 3 and face the final quiz.'
					: canPushFacingBlock
						? 'Press E to push the block in front of you.'
					: nearInteractable
						? 'Press E near the marker to inspect it.'
						: 'Find the marked stairs to proceed to level 3.',
				objective: 'Reach level 3 and unlock yellow (green channel).',
				canInteract: nearExit || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-three-hunt-yellow') {
			if (this.isDungeonQuizActive && this.activeDungeonQuizId === 'yellow') {
				this.emitHudState({
					level: 3,
					state: this.state,
					status: 'Final quiz in progress: answer 3 segment-2 questions to unlock yellow.',
					hint: 'Complete the quiz overlay with keyboard or pointer. ESC closes the quiz.',
					objective: 'Pass the final segment-2 quiz.',
					canInteract: false
				});
				return;
			}

			this.emitHudState({
				level: 3,
				state: this.state,
				status: 'Final challenge: talk to the penguin to unlock yellow.',
				hint: nearNpc
					? 'Press E to start a 3-question quiz from segment 2. You must score 3/3.'
					: canPushFacingBlock
						? 'Press E to push puzzle blocks and clear the route.'
					: nearInteractable
						? 'Press E near the marker to inspect it.'
						: this.lastYellowQuizCorrectAnswers > 0
							? `Last final quiz score: ${this.lastYellowQuizCorrectAnswers}/3. Talk to the penguin to retry.`
							: 'Find the penguin and pass the final quiz.',
				objective: 'Unlock yellow (green channel) to restore full RGB.',
				canInteract: nearNpc || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-three-yellow-unlocked') {
			this.emitHudState({
				level: 3,
				state: this.state,
				status: 'Yellow restored. A deeper descent path is now open.',
				hint: nearExit
					? 'Press E to descend to level 4 and solve the block-button puzzle.'
					: canPushFacingBlock
						? 'Press E to push the block in front of you.'
						: nearInteractable
							? 'Press E near the marker to inspect it.'
							: 'Find the descent marker to continue.',
				objective: 'Descend to level 4.',
				canInteract: nearExit || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-four-button-puzzle') {
			const buttonCount = this.getButtonMarkers().length;
			const pressedCount = this.pressedButtonKeys.size;
			this.emitHudState({
				level: 4,
				state: this.state,
				status: 'Final puzzle: press all floor buttons using push blocks.',
				hint: nearExit
					? this.areAllButtonsPressed()
						? 'All buttons are active. Press E at the gate to complete the dungeon.'
						: 'Gate is locked. Activate all buttons first.'
					: canPushFacingBlock
						? 'Press E to push the block in front of you.'
						: nearInteractable
							? 'Press E near the marker to inspect it.'
							: 'Position blocks on every button tile.',
				objective: `Activate all floor buttons (${pressedCount}/${buttonCount}).`,
				canInteract: nearExit || nearInteractable || canPushFacingBlock
			});
			return;
		}

		this.emitHudState({
			level: this.currentLevel,
			state: 'complete',
			status: this.blueUnlocked && this.redUnlocked && this.yellowUnlocked
				? 'Dungeon challenge complete: full RGB restored and the final gate opened.'
				: 'Dungeon challenge complete.',
			hint: nearInteractable
				? 'Press E near a marker to inspect it.'
				: 'Explore freely.',
			objective: 'Completed.',
			canInteract: nearInteractable || canPushFacingBlock
		});
	}

	private emitHudState(payload: DungeonHudState) {
		EventBus.emit('dungeon:hud-state-changed', payload);
	}

	private isoToWorld(isoX: number, isoY: number): Vec2 {
		return this.dungeonRenderer.isoToWorld(isoX, isoY, this.worldOffsetX, this.worldOffsetY);
	}

	private updateCameraBoundsForCurrentMap() {
		if (this.mapWidth <= 0 || this.mapHeight <= 0) {
			return;
		}

		const mapPixelWidth = (this.mapWidth + this.mapHeight) * (TILE_WIDTH / 2);
		const mapPixelHeight = (this.mapWidth + this.mapHeight) * (TILE_HEIGHT / 2);

		this.cameras.main.setBounds(
			this.worldOffsetX - mapPixelWidth * 0.5 - TILE_WIDTH,
			this.worldOffsetY - TILE_HEIGHT,
			mapPixelWidth + TILE_WIDTH * 2,
			mapPixelHeight + TILE_HEIGHT * 3
		);
	}

	private handleResize(gameSize: Phaser.Structs.Size) {
		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		const { width, height } = gameSize;
		this.worldOffsetX = width * 0.5;
		this.worldOffsetY = height * 0.18;
		this.cameras.main.setSize(width, height);
		this.updateCameraBoundsForCurrentMap();
		this.drawDungeon();
		this.updateLevelMarker();
		this.renderInteractableMarkers();
		this.renderButtonMarkers();
		this.pushBlocks.forEach((block) => syncPushBlockSprite(block, isoToWorld));
		syncPlayerSprite(this.player, isoToWorld);
		if (this.npc) {
			syncNpcSprite(this.npc, isoToWorld);
		}
	}
}
