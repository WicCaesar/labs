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
import { damageEnemy, spawnNpc, syncNpcSprite, type NpcState, updateEnemyNpcMovement, updateNpcMovement } from './isometricDungeon/npc';
import { spawnPlayer, syncPlayerSprite, type PlayerState, updatePlayerMovement } from './isometricDungeon/player';
import { fireSnowball, updateSnowballProjectile, type SnowballProjectile } from './isometricDungeon/projectiles';

export class IsometricDungeon extends Phaser.Scene {
	private readonly map: number[][] = [];

	private readonly collisionMap: number[][] = [];

	private levels!: Record<DungeonLevelId, DungeonLevelConfig>;

	private currentLevel: DungeonLevelId = DUNGEON_LEVEL.ONE;

	private state: DungeonState = 'level-one-hunt-blue';

	private dungeonRenderer!: DungeonRenderer;

	private player!: PlayerState;

	private npcs: NpcState[] = [];

	private exitMarkerOuter?: Phaser.GameObjects.Ellipse;

	private exitMarkerInner?: Phaser.GameObjects.Ellipse;

	private markerVisuals: Phaser.GameObjects.Ellipse[] = [];

	private buttonVisuals: Phaser.GameObjects.Container[] = [];

	private readonly pushBlocks: PushBlockState[] = [];

	private readonly activatedInteractableKeys = new Set<string>();

	private readonly pressedButtonKeys = new Set<string>();

	private readonly exitUnlockedByLevel = new Map<DungeonLevelId, boolean>();

	private exitSparkleTimer: Phaser.Time.TimerEvent | null = null;

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

	private snowballs: SnowballProjectile[] = [];

	private weaponCooldown = 0;

	private worldOffsetX = 0;

	private worldOffsetY = 0;

	private score = 0;

	private readonly POINTS_PER_KILL = 10;

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
		const isEnemyLevel = levelNpcRole === 'enemy';
		const allEnemiesDefeated = this.npcs.length === 0 || this.npcs.every(npc => npc.health <= 0);

		for (const npc of this.npcs) {
			if (this.state === 'level-two-hunt-red' && !allEnemiesDefeated && isEnemyLevel) {
				updateEnemyNpcMovement(npc, this.player.gridPos, delta, this.collisionMap, this.mapWidth, this.mapHeight);
				this.handleEnemyTouchDamage();
			} else {
				updateNpcMovement(npc, delta, this.collisionMap, this.mapWidth, this.mapHeight);
			}
		}

		for (const npc of this.npcs) {
			syncNpcSprite(npc, isoToWorld, this.currentLevel === DUNGEON_LEVEL.TWO && !allEnemiesDefeated);
		}

		this.updateWeaponSystem(delta, isoToWorld);

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
		console.log('drawDungeon() called, map:', this.map.length, 'rows, worldOffset:', this.worldOffsetX, this.worldOffsetY);
		if (!this.map || this.map.length === 0) {
			console.error('ERROR: Map is empty or undefined!');
			return;
		}
		this.dungeonRenderer.draw(this.map, this.worldOffsetX, this.worldOffsetY);
		console.log('drawDungeon() completed');
	}

	private spawnActorsForLevel() {
		console.log('spawnActorsForLevel() started');
		const level = this.levels[this.currentLevel];
		console.log('Current level:', this.currentLevel, 'Level data:', level);
		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);

		if (this.player && this.player.sprite) {
			this.player.sprite.destroy();
		}
		for (const npc of this.npcs) {
			if (npc.sprite) npc.sprite.destroy();
			if (npc.healthBarBg) npc.healthBarBg.destroy();
			if (npc.healthBarFill) npc.healthBarFill.destroy();
		}
		this.npcs = [];
		this.pushBlocks.forEach((block) => block.sprite.destroy());
		this.pushBlocks.length = 0;

		const spawn = this.ensureWalkable(level.playerSpawn);
		this.player = spawnPlayer(this, spawn, isoToWorld);
		const world = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(world.x, world.y);

		const isEnemy = level.npcRole === 'enemy';
		if (level.npcSpawns.length > 0 && level.npcBehavior) {
			for (const spawnPos of level.npcSpawns) {
				const npcSpawn = this.ensureWalkable(spawnPos);
				const npc = spawnNpc(this, npcSpawn, isoToWorld, isEnemy, level.npcBehavior);
				const hideDefeatedEnemyNpc = this.currentLevel === DUNGEON_LEVEL.TWO && this.redUnlocked;
				npc.sprite.setVisible(!hideDefeatedEnemyNpc);
				this.npcs.push(npc);
			}
		}

		for (const [index, spawn] of level.pushBlocks.entries()) {
			const blockId = `${this.currentLevel}-${spawn.kind}-${spawn.position.x}-${spawn.position.y}-${index}`;
			this.pushBlocks.push(spawnPushBlock(this, spawn.kind, spawn.position, isoToWorld, blockId));
		}
		this.rebuildCollisionMap();
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
		if (this.blueUnlocked || this.isDungeonQuizActive || this.currentLevel !== DUNGEON_LEVEL.ONE || this.npcs.length === 0) {
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
		if (this.yellowUnlocked || this.isDungeonQuizActive || this.currentLevel !== DUNGEON_LEVEL.THREE || this.npcs.length === 0) {
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
		if (this.redUnlocked || this.npcs.length === 0) {
			return;
		}

		this.redUnlocked = true;
		this.state = 'level-two-red-unlocked';
		for (const npc of this.npcs) {
			npc.sprite.setVisible(false);
			npc.healthBarBg.setVisible(false);
			npc.healthBarFill.setVisible(false);
		}
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

		if (this.currentLevel === DUNGEON_LEVEL.TWO) {
			return 'red-unlocked';
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
		if (this.redUnlocked || this.npcs.length === 0) {
			return;
		}

		const now = this.time.now;
		if (now - this.lastPlayerHitAt < 1250) {
			return;
		}

		for (const npc of this.npcs) {
			const nearEnemy = distanceBetween(this.player.gridPos, npc.gridPos) <= 0.75;
			if (nearEnemy) {
				this.lastPlayerHitAt = now;
				this.scene.stop();
				this.scene.start(SCENE_KEYS.DEATH_SCREEN, { score: this.score });
				return;
			}
		}
	}

	private updateWeaponSystem(delta: number, isoToWorld: (x: number, y: number) => { x: number; y: number }) {
		const isHostileLevel = this.currentLevel === DUNGEON_LEVEL.TWO && !this.redUnlocked;
		const aliveEnemies = this.npcs.filter(npc => npc.health > 0);

		if (isHostileLevel && aliveEnemies.length > 0) {
			const nearestEnemy = this.findNearestEnemy(aliveEnemies);

			if (nearestEnemy && this.isEnemyInRange(this.player.gridPos, nearestEnemy)) {
				this.weaponCooldown -= delta;

				if (this.weaponCooldown <= 0) {
					const playerWorld = isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
					const snowball = fireSnowball(this, playerWorld, nearestEnemy.gridPos, isoToWorld);
					if (snowball) {
						snowball.targetNpc = nearestEnemy;
						this.snowballs.push(snowball);
						this.weaponCooldown = 500;
					}
				}
			}
		}

		for (let i = this.snowballs.length - 1; i >= 0; i--) {
			const snowball = this.snowballs[i];
			updateSnowballProjectile(snowball, delta);

			if (snowball.active && snowball.targetNpc) {
				const enemyWorld = isoToWorld(snowball.targetNpc.gridPos.x, snowball.targetNpc.gridPos.y);
				const dx = snowball.x - enemyWorld.x;
				const dy = snowball.y - enemyWorld.y;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (dist < 20) {
					damageEnemy(snowball.targetNpc, snowball.damage);
					snowball.active = false;
					snowball.graphics.destroy();

					if (snowball.targetNpc.health <= 0) {
						snowball.targetNpc.sprite.destroy();
						snowball.targetNpc.healthBarBg.destroy();
						snowball.targetNpc.healthBarFill.destroy();

						const index = this.npcs.indexOf(snowball.targetNpc);
						if (index > -1) {
							this.npcs.splice(index, 1);
						}

						this.score += this.POINTS_PER_KILL;

						const allEnemiesDefeated = this.npcs.length === 0;
						if (allEnemiesDefeated) {
							this.killEnemyUnlockRed();
						}
					}
				}
			}

			if (!snowball.active) {
				this.snowballs.splice(i, 1);
			}
		}
	}

	private findNearestEnemy(enemies: NpcState[]): NpcState | null {
		let nearest: NpcState | null = null;
		let minDist = Infinity;

		for (const enemy of enemies) {
			const dist = distanceBetween(this.player.gridPos, enemy.gridPos);
			if (dist < minDist) {
				minDist = dist;
				nearest = enemy;
			}
		}

		return nearest;
	}

	private isEnemyInRange(playerPos: Vec2, enemy: NpcState): boolean {
		const dist = distanceBetween(playerPos, enemy.gridPos);
		return dist <= 3;
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

		for (const npc of this.npcs) {
			if (npc.sprite.visible) {
				const npcTile = {
					x: Math.round(npc.gridPos.x),
					y: Math.round(npc.gridPos.y)
				};
				if (npcTile.x === tileX && npcTile.y === tileY) {
					return true;
				}
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
		if (this.npcs.length === 0) {
			return false;
		}

		for (const npc of this.npcs) {
			if (distanceBetween(this.player.gridPos, npc.gridPos) <= INTERACTION_DISTANCE) {
				return true;
			}
		}
		return false;
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
					status: 'Quiz em andamento: responda 3 perguntas para restaurar o azul.',
					hint: 'Complete o quiz usando teclado ou mouse. ESC fecha o quiz.',
					objective: 'Passe no quiz de 3 perguntas para desbloquear azul.',
					canInteract: false
				});
				return;
			}

			this.emitHudState({
				level: 1,
				state: this.state,
				status: 'A masmorra está em escala de cinza. Fale com o pinguim para iniciar o quiz azul.',
				hint: nearExit
					? 'Pressione E para descer agora, ou pressione E perto do pinguim para fazer o quiz azul primeiro.'
					: canPushFacingBlock
						? 'Pressione E para empurrar o bloco à sua frente.'
					: nearNpc
						? 'Pressione E para iniciar um quiz de 3 perguntas. Tire 3/3 para desbloquear azul.'
						: nearInteractable
							? 'Pressione E perto da marcação para inspecioná-la.'
						: this.lastBlueQuizCorrectAnswers > 0
							? `Última pontuação: ${this.lastBlueQuizCorrectAnswers}/3. Fale com o pinguim para tentar novamente.`
							: 'Encontre o buraco central para descer, ou encontre o pinguim e passe no quiz para desbloquear azul.',
				objective: 'Opcional: passe no quiz de 3 perguntas para desbloquear azul. Caminho principal: desça para o nível 2.',
				canInteract: nearNpc || nearExit || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-one-blue-unlocked') {
			this.emitHudState({
				level: 1,
				state: this.state,
				status: 'Azul restaurado. O buraco de descida está ativo.',
				hint: nearExit
					? 'Pressione E para descer para o próximo nível.'
					: canPushFacingBlock
						? 'Pressione E para empurrar o bloco à sua frente.'
					: nearInteractable
						? 'Pressione E perto da marcação para inspecioná-la.'
					: 'Encontre o buraco escuro perto do centro da masmorra.',
				objective: 'Desça para o nível 2.',
				canInteract: nearExit || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-two-hunt-red') {
			this.emitHudState({
				level: 2,
				state: this.state,
				status: 'O pinguim está hostil agora. Fique em movimento.',
				hint: nearNpc
					? 'Pressione E perto do pinguim inimigo para atacar e derrotá-lo.'
					: canPushFacingBlock
						? 'Pressione E para empurrar o bloco à sua frente e abrir um caminho mais seguro.'
					: nearInteractable
						? 'Pressione E perto da marcação para inspecioná-la enquanto evita o inimigo.'
					: 'Evite o contato. Aproxime-se apenas quando estiver pronto para atacar.',
				objective: 'Derrote o pinguim inimigo para desbloquear vermelho.',
				canInteract: nearNpc || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-two-red-unlocked') {
			this.emitHudState({
				level: 2,
				state: this.state,
				status: 'Vermelho restaurado. As próximas escadas estão ativas.',
				hint: nearExit
					? 'Pressione E para descer para o nível 3 e enfrentar o quiz final.'
					: canPushFacingBlock
						? 'Pressione E para empurrar o bloco à sua frente.'
					: nearInteractable
						? 'Pressione E perto da marcação para inspecioná-la.'
						: 'Encontre as escadas marcadas para seguir para o nível 3.',
				objective: 'Chegue ao nível 3 e desbloqueie amarelo (canal verde).',
				canInteract: nearExit || nearInteractable || canPushFacingBlock
			});
			return;
		}

		if (this.state === 'level-three-hunt-yellow') {
			if (this.isDungeonQuizActive && this.activeDungeonQuizId === 'yellow') {
				this.emitHudState({
					level: 3,
					state: this.state,
					status: 'Quiz final em andamento: responda 3 perguntas do segmento 2 para desbloquear amarelo.',
					hint: 'Complete o quiz usando teclado ou mouse. ESC fecha o quiz.',
					objective: 'Passe no quiz final do segmento 2.',
					canInteract: false
				});
				return;
			}

			this.emitHudState({
				level: 3,
				state: this.state,
				status: 'Desafio final: fale com o pinguim para desbloquear amarelo.',
				hint: nearNpc
					? 'Pressione E para iniciar um quiz de 3 perguntas do segmento 2. Tire 3/3.'
					: canPushFacingBlock
						? 'Pressione E para empurrar blocos de puzzle e abrir a rota.'
					: nearInteractable
						? 'Pressione E perto da marcação para inspecioná-la.'
						: this.lastYellowQuizCorrectAnswers > 0
							? `Última pontuação final: ${this.lastYellowQuizCorrectAnswers}/3. Fale com o pinguim para tentar novamente.`
							: 'Encontre o pinguim e passe no quiz final.',
				objective: 'Desbloqueie amarelo (canal verde) para restaurar RGB completo.',
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
			status: this.blueUnlocked && this.redUnlocked
				? 'Desafio final completo: RGB completo restaurado.'
				: 'Desafio final completo: verde desbloqueado. Recupere azul + vermelho para RGB completo.',
			hint: this.blueUnlocked && this.redUnlocked
				? (nearInteractable
					? 'Todos os canais de cor recuperados. Pressione E perto de uma marcação para inspecioná-la.'
					: 'Todos os canais de cor recuperados. Explore livremente.')
				: (nearInteractable
					? 'Verde restaurado. Pressione E perto de uma marcação para inspecioná-la enquanto busca os canais faltantes.'
					: 'Verde restaurado. Volte para desbloquear os canais restantes se necessário.'),
			objective: 'Completo.',
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
		for (const npc of this.npcs) {
			syncNpcSprite(npc, isoToWorld, this.currentLevel === DUNGEON_LEVEL.TWO && !this.redUnlocked);
		}
	}
}
