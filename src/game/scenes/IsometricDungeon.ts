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

	private npc!: NpcState;

	private exitMarker?: Phaser.GameObjects.Ellipse;

	private markerVisuals: Phaser.GameObjects.Ellipse[] = [];

	private readonly pushBlocks: PushBlockState[] = [];

	private readonly activatedInteractableKeys = new Set<string>();

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

		const isEnemyLevel = this.levels[this.currentLevel].npcRole === 'enemy';
		if (this.state === 'level-two-hunt-red' && !this.redUnlocked && isEnemyLevel) {
			updateEnemyNpcMovement(this.npc, this.player.gridPos, delta, this.collisionMap, this.mapWidth, this.mapHeight);
			this.handleEnemyTouchDamage();
		} else {
			updateNpcMovement(this.npc, delta, this.collisionMap, this.mapWidth, this.mapHeight);
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
		this.mapWidth = level.mapWidth;
		this.mapHeight = level.mapHeight;

		if (levelId === DUNGEON_LEVEL.ONE) {
			this.state = this.blueUnlocked ? 'level-one-blue-unlocked' : 'level-one-hunt-blue';
		} else if (levelId === DUNGEON_LEVEL.TWO) {
			this.state = this.redUnlocked ? 'level-two-red-unlocked' : 'level-two-hunt-red';
			this.level2RespawnPoint = { ...level.playerSpawn };
		} else {
			this.state = this.yellowUnlocked ? 'complete' : 'level-three-hunt-yellow';
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
		this.pushBlocks.forEach((block) => block.sprite.destroy());
		this.pushBlocks.length = 0;

		const spawn = this.ensureWalkable(level.playerSpawn);
		this.player = spawnPlayer(this, spawn, isoToWorld);
		const world = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(world.x, world.y);

		const npcSpawn = this.ensureWalkable(level.npcSpawn);
		this.npc = spawnNpc(this, npcSpawn, isoToWorld);
		const hideDefeatedEnemyNpc = this.currentLevel === DUNGEON_LEVEL.TWO && this.redUnlocked;
		this.npc.sprite.setVisible(!hideDefeatedEnemyNpc);

		for (const [index, spawn] of level.pushBlocks.entries()) {
			const blockId = `${this.currentLevel}-${spawn.kind}-${spawn.position.x}-${spawn.position.y}-${index}`;
			this.pushBlocks.push(spawnPushBlock(this, spawn.kind, spawn.position, isoToWorld, blockId));
		}
		this.rebuildCollisionMap();
		this.renderInteractableMarkers();
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

			const nearNpc = distanceBetween(this.player.gridPos, this.npc.gridPos) <= INTERACTION_DISTANCE;
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
			const nearEnemy = distanceBetween(this.player.gridPos, this.npc.gridPos) <= INTERACTION_DISTANCE;
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
			const nearNpc = distanceBetween(this.player.gridPos, this.npc.gridPos) <= INTERACTION_DISTANCE;
			if (nearNpc) {
				this.startYellowUnlockQuiz();
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
		if (this.blueUnlocked || this.isDungeonQuizActive || this.currentLevel !== DUNGEON_LEVEL.ONE) {
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
		if (this.yellowUnlocked || this.isDungeonQuizActive || this.currentLevel !== DUNGEON_LEVEL.THREE) {
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
		if (this.redUnlocked) {
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
		this.state = 'complete';
		this.emitWorldColorFilterState();
		this.cameras.main.flash(420, 120, 255, 120);
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

		if (this.npc.sprite.visible) {
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
		this.exitMarker = this.add.ellipse(0, 0, 26, 14, 0x0b0b0b, 0.8).setDepth(8);
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

	private getMarkerKey(levelId: DungeonLevelId, marker: DungeonInteractableMarker): string {
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
		if (!this.exitMarker) {
			return;
		}

		const level = this.levels[this.currentLevel];
		if (!level.exitTile) {
			this.exitMarker.setVisible(false);
			return;
		}

		const world = this.isoToWorld(level.exitTile.x + 0.5, level.exitTile.y + 0.5);
		const exitAvailable = this.currentLevel !== DUNGEON_LEVEL.TWO || this.redUnlocked;
		this.exitMarker.setVisible(true);
		this.exitMarker.setPosition(world.x, world.y - TILE_HEIGHT * 0.16);
		this.exitMarker.setFillStyle(exitAvailable ? 0x111111 : 0x2c2c2c, exitAvailable ? 0.88 : 0.58);
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

		this.emitHudState({
			level: 3,
			state: 'complete',
			status: this.blueUnlocked && this.redUnlocked
				? 'Final challenge complete: full RGB restored.'
				: 'Final challenge complete: green unlocked. Recover blue + red for full RGB.',
			hint: this.blueUnlocked && this.redUnlocked
				? (nearInteractable
					? 'All color channels recovered. Press E near a marker to inspect it.'
					: 'All color channels recovered. Explore freely.')
				: (nearInteractable
					? 'Green restored. Press E near a marker to inspect it while you hunt missing channels.'
					: 'Green restored. Return to unlock remaining channels if needed.'),
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
		this.pushBlocks.forEach((block) => syncPushBlockSprite(block, isoToWorld));
		syncPlayerSprite(this.player, isoToWorld);
		syncNpcSprite(this.npc, isoToWorld);
	}
}
