import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';
import { EventBus } from '../../shared/events/EventBus';
import { DungeonRenderer } from './isometricDungeon/DungeonRenderer';
import { INTERACTION_DISTANCE, TILE_HEIGHT, TILE_WIDTH } from './isometricDungeon/constants';
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

	private levels!: Record<DungeonLevelId, DungeonLevelConfig>;

	private currentLevel: DungeonLevelId = DUNGEON_LEVEL.ONE;

	private state: DungeonState = 'level-one-hunt-blue';

	private dungeonRenderer!: DungeonRenderer;

	private player!: PlayerState;

	private npc!: NpcState;

	private exitMarker?: Phaser.GameObjects.Ellipse;

	private markerVisuals: Phaser.GameObjects.Ellipse[] = [];

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

	private isBlueQuizActive = false;

	private lastBlueQuizCorrectAnswers = 0;

	private readonly blueQuizQuestionCount = 3;

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
			EventBus.on('ui:dungeon-blue-quiz-finished', ({ passed, correctAnswers }) => {
				this.handleBlueQuizFinished(passed, correctAnswers);
			}),
			EventBus.on('ui:dungeon-blue-quiz-cancelled', () => {
				this.handleBlueQuizCancelled();
			})
		);
		EventBus.emit('world:color-filter-state-changed', { mode: 'grayscale' });
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
		if (this.isBlueQuizActive) {
			this.publishHudState();
			return;
		}

		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		const move = this.getMovementInput();
		updatePlayerMovement(this.player, move, delta, this.map, this.mapWidth, this.mapHeight);
		syncPlayerSprite(this.player, isoToWorld);
		const playerWorld = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(playerWorld.x, playerWorld.y);

		const isEnemyLevel = this.levels[this.currentLevel].npcRole === 'enemy';
		if (this.state === 'level-two-hunt-red' && !this.redUnlocked && isEnemyLevel) {
			updateEnemyNpcMovement(this.npc, this.player.gridPos, delta, this.map, this.mapWidth, this.mapHeight);
			this.handleEnemyTouchDamage();
		} else {
			updateNpcMovement(this.npc, delta, this.map, this.mapWidth, this.mapHeight);
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
		} else {
			this.state = this.redUnlocked ? 'complete' : 'level-two-hunt-red';
			this.level2RespawnPoint = { ...level.playerSpawn };
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

		const spawn = this.ensureWalkable(level.playerSpawn);
		this.player = spawnPlayer(this, spawn, isoToWorld);
		const world = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(world.x, world.y);

		const npcSpawn = this.ensureWalkable(level.npcSpawn);
		this.npc = spawnNpc(this, npcSpawn, isoToWorld);
		this.npc.sprite.setVisible(!this.redUnlocked || this.currentLevel === DUNGEON_LEVEL.ONE);
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

		this.tryActivateNearbyInteractable();
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

	private startBlueUnlockQuiz() {
		if (this.blueUnlocked || this.isBlueQuizActive || this.currentLevel !== DUNGEON_LEVEL.ONE) {
			return;
		}

		this.isBlueQuizActive = true;
		this.lastBlueQuizCorrectAnswers = 0;
		EventBus.emit('dungeon:blue-quiz-requested', {
			questionCount: this.blueQuizQuestionCount
		});
	}

	private handleBlueQuizFinished(passed: boolean, correctAnswers: number) {
		if (!this.isBlueQuizActive || this.currentLevel !== DUNGEON_LEVEL.ONE || this.blueUnlocked) {
			return;
		}

		this.isBlueQuizActive = false;
		this.lastBlueQuizCorrectAnswers = correctAnswers;

		if (passed) {
			this.unlockBlueChannel();
			return;
		}

		this.cameras.main.shake(130, 0.006);
	}

	private handleBlueQuizCancelled() {
		if (!this.isBlueQuizActive || this.currentLevel !== DUNGEON_LEVEL.ONE || this.blueUnlocked) {
			return;
		}

		this.isBlueQuizActive = false;
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
		const nearInteractable = this.getNearestInteractable() !== null;

		if (this.state === 'level-one-hunt-blue') {
			if (this.isBlueQuizActive) {
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
					: nearNpc
						? 'Press E to start a 3-question quiz. You must score 3/3 to unlock blue.'
						: nearInteractable
							? 'Press E near the marker to inspect it.'
						: this.lastBlueQuizCorrectAnswers > 0
							? `Last quiz score: ${this.lastBlueQuizCorrectAnswers}/3. Talk to the penguin to retry.`
							: 'Find the center hole to descend, or find the penguin and pass the quiz to unlock blue.',
				objective: 'Optional: pass a 3-question quiz to unlock blue. Main path: descend to level 2.',
				canInteract: nearNpc || nearExit || nearInteractable
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
					: nearInteractable
						? 'Press E near the marker to inspect it.'
					: 'Find the dark hole near the center of the dungeon.',
				objective: 'Descend to level 2.',
				canInteract: nearExit || nearInteractable
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
					: nearInteractable
						? 'Press E near the marker to inspect it while avoiding the enemy.'
					: 'Avoid contact. Close in only when you are ready to attack.',
				objective: 'Defeat the enemy penguin to unlock red.',
				canInteract: nearNpc || nearInteractable
			});
			return;
		}

		this.emitHudState({
			level: 2,
			state: 'complete',
			status: 'Challenge complete: red channel unlocked.',
			hint: nearInteractable
				? 'All primary colors recovered. Press E near a marker to inspect it.'
				: 'All primary colors recovered. Explore freely.',
			objective: 'Completed.',
			canInteract: nearInteractable
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
		syncPlayerSprite(this.player, isoToWorld);
		syncNpcSprite(this.npc, isoToWorld);
	}
}
