import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';
import { EventBus } from '../../shared/events/EventBus';
import type { WorldColorFilterMode } from '../../shared/events/EventBus';
import { DungeonRenderer } from './isometricDungeon/DungeonRenderer';
import { INTERACTION_DISTANCE, PLAYER_SCALE, TILE_HEIGHT, TILE_WIDTH } from './isometricDungeon/constants';
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
	type DungeonInteractableMarker,
	type DungeonLevelConfig,
	type DungeonLevelId,
	type DungeonState
} from './isometricDungeon/levelConfig';
import type { DungeonMarker } from './isometricDungeon/dungeonMapParser';
import { distanceBetween, isWalkable } from './isometricDungeon/navigation';
import type { DirectionKey, Vec2 } from './isometricDungeon/types';
import { spawnNpc, syncNpcSprite, type NpcState, updateEnemyNpcMovement, updateNpcMovement, damageEnemy } from './isometricDungeon/npc';
import { spawnPlayer, syncPlayerSprite, type PlayerState, updatePlayerMovement } from './isometricDungeon/player';
import { fireSnowball, updateSnowballProjectile, type SnowballProjectile } from './isometricDungeon/projectiles';
import { resolveDungeonInteractionAction } from './isometricDungeon/interactionState';
import { findNearestEnemy } from './isometricDungeon/combatSystem';
import {
	resolveExitAvailableForLevel,
	resolveStateForLevelLoad,
	resolveWorldColorFilterMode
} from './isometricDungeon/progressionState';
import { COLLECTIBLE_CONFIGS } from '../../shared/constants/collectibleConfig';
import { spawnCollectibles, updateCollectibleOverlap, removeCollectibleFromWorld, clearAllCollectibles } from './isometricDungeon/collectibles';
import type { CollectibleItem } from '../../shared/types/collectibles';
import { getUpgrades, saveUpgrades, getSnowballCooldown, getBlueSwordCooldown, getSnowballDamage, getBlueSwordDamage, getBlueSwordArcAngle } from './PowerUpScreen';

const SPIN_DIRECTIONS: DirectionKey[] = [
	'north',
	'north-east',
	'east',
	'south-east',
	'south',
	'south-west',
	'west',
	'north-west'
];

const SPIN_FRAME_DURATION_MS = 120;
const LERDILSON_JUMP_PERIOD_MS = 560;
const LERDILSON_JUMP_AMPLITUDE = TILE_HEIGHT * 0.16;

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

	private spawnedCollectibles: Map<string, { item: CollectibleItem; graphics: Phaser.GameObjects.Text }> = new Map();

	private readonly collectedCollectibleIds = new Set<string>();

	private totalCollectiblesForLevel = 0;

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

	private readonly yellowQuizQuestionCount = 3;

	private readonly unsubscribeHandlers: Array<() => void> = [];

	private readonly npcDialogueInteractionCountByLevel = new Map<DungeonLevelId, number>();

	private isNpcDialogueActive = false;

	private npcDialogueCooldownUntil = 0;

	private readonly npcDialogueCooldownMs = 250;

	private snowballs: SnowballProjectile[] = [];

	private weaponCooldown = 0;

	private blueSwordActive = false;

	private worldOffsetX = 0;

	private worldOffsetY = 0;

	private score = 0;

	private readonly POINTS_PER_KILL = 10;

	private currentWave = 0;

	private readonly WAVE_CONFIGS = [
		{
			enemyCount: 3,
			enemyHealth: 5,
			enemyPoints: 25
		},
		{
			enemyCount: 5,
			enemyHealth: 30,
			enemyPoints: 50
		},
		{
			enemyCount: 10,
			enemyHealth: 10,
			enemyPoints: 50,
			bossHealth: 100,
			bossPoints: 200
		}
	];

	private exclamationIndicators: {
		graphic: Phaser.GameObjects.Image;
		npc: NpcState;
	}[] = [];

	private spawnIndicators: Phaser.GameObjects.GameObject[] = [];

	private isLevelTwoIntroFrozen = false;

	private waveCountdownText: Phaser.GameObjects.Text | null = null;

	private waveCountdownTimer: Phaser.Time.TimerEvent | null = null;

	private lerdilsonSpinElapsedMs = 0;

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
		this.load.setPath('assets/sprites/kenney_cursor-pack/PNG/Outline/Double');
		this.load.image('marker-exclamation', 'mark_exclamation.png');
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
		this.initializeCollectiblesForLevel();
		this.createInput();
		this.createLevelMarker();
		this.unsubscribeHandlers.push(
			EventBus.on('ui:dungeon-quiz-finished', ({ quizId, passed, correctAnswers }) => {
				this.handleDungeonQuizFinished(quizId, passed, correctAnswers);
			}),
			EventBus.on('ui:dungeon-quiz-cancelled', ({ quizId }) => {
				this.handleDungeonQuizCancelled(quizId);
			}),
			EventBus.on('dungeon:dialogue-finished', ({ shouldStartQuiz, quizId }) => {
				this.isNpcDialogueActive = false;
				if (this.isLevelTwoIntroFrozen && this.currentLevel === DUNGEON_LEVEL.TWO) {
					this.isLevelTwoIntroFrozen = false;
				}
				this.npcDialogueCooldownUntil = this.time.now + this.npcDialogueCooldownMs;

				if (shouldStartQuiz) {
					this.startConfiguredNpcQuiz(quizId ?? null);
				}
			})
		);
		this.emitWorldColorFilterState();

		this.scale.on('resize', this.handleResize, this);
		this.events.once('shutdown', () => {
			this.stopExitSparkleLoop();
			this.hideWaveCountdown();
			this.hideSpawnIndicators();
			this.hideExclamationIndicators();
			this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
			this.unsubscribeHandlers.length = 0;
			EventBus.emit('world:color-filter-state-changed', { mode: 'none' });
			this.scale.off('resize', this.handleResize, this);
		});
	}

	update(_: number, delta: number) {
		if (this.isDungeonQuizActive || this.isLevelTwoIntroFrozen) {
			return;
		}

		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		const move = this.getMovementInput();
		this.rebuildCollisionMap();
		updatePlayerMovement(this.player, move, delta, this.collisionMap, this.mapWidth, this.mapHeight);
		syncPlayerSprite(this.player, isoToWorld);
		const playerWorld = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(playerWorld.x, playerWorld.y);

		const allEnemiesDefeated = this.npcs.length === 0 || this.npcs.every(npc => npc.health <= 0);

		for (const npc of this.npcs) {
			if (npc.health > 0 && npc.isEnemy) {
				updateEnemyNpcMovement(npc, this.player.gridPos, delta, this.collisionMap, this.mapWidth, this.mapHeight, this.npcs);
				this.handleEnemyTouchDamage();
			} else {
				updateNpcMovement(npc, delta, this.collisionMap, this.mapWidth, this.mapHeight);
			}
		}

		for (const npc of this.npcs) {
			syncNpcSprite(npc, isoToWorld, this.currentLevel === DUNGEON_LEVEL.TWO && !allEnemiesDefeated);
		}

		this.updateExclamationIndicatorPositions();

		this.applyLerdilsonCelebrationSpin(delta);

		this.updateWeaponSystem(delta, isoToWorld);

		// Check for collectible item pickups
		this.updateCollectiblesOverlap();

		if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
			this.handleInteraction();
		}
	}

	private loadLevel(levelId: DungeonLevelId, isInitialLoad = false) {
		this.currentLevel = levelId;
		const level = this.levels[levelId];
		const map = level.map;
		this.map.length = 0;
		this.map.push(...map);
		this.mapWidth = level.mapWidth;
		this.mapHeight = level.mapHeight;

		this.state = resolveStateForLevelLoad({
			levelId,
			blueUnlocked: this.blueUnlocked,
			redUnlocked: this.redUnlocked,
			yellowUnlocked: this.yellowUnlocked
		});

		if (!isInitialLoad) {
			this.updateCameraBoundsForCurrentMap();
			this.drawDungeon();
			this.updateLevelMarker();
			this.spawnActorsForLevel();
			this.initializeCollectiblesForLevel();
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
		this.hideWaveCountdown();
		this.hideSpawnIndicators();
		this.hideExclamationIndicators();
		this.currentWave = 0;
		this.pushBlocks.forEach((block) => block.sprite.destroy());
		this.pushBlocks.length = 0;

		const spawn = this.ensureWalkable(level.playerSpawn);
		this.player = spawnPlayer(this, spawn, isoToWorld);
		const world = this.isoToWorld(this.player.gridPos.x, this.player.gridPos.y);
		this.cameras.main.centerOn(world.x, world.y);

		const isEnemy = level.npcRole === 'enemy';
		if (this.currentLevel === DUNGEON_LEVEL.TWO) {
			this.spawnWaveWithIndicator(0);
		} else if (level.npcSpawns.length > 0 && level.npcBehavior) {
			for (const spawnPos of level.npcSpawns) {
				const npcSpawn = this.ensureWalkable(spawnPos);
				const npc = spawnNpc(this, npcSpawn, isoToWorld, isEnemy, level.npcBehavior);
				npc.sprite.setVisible(true);
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

		this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
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
		if (this.isNpcDialogueActive || this.time.now < this.npcDialogueCooldownUntil) {
			return;
		}

		if (this.tryPushBlockInFacingDirection()) {
			return;
		}

		const action = resolveDungeonInteractionAction({
			state: this.state,
			redUnlocked: this.redUnlocked,
			nearExit: this.isNearLevelExit(),
			nearNpc: this.isPlayerNearNpc(),
			allButtonsPressed: this.areAllButtonsPressed()
		});

		switch (action) {
			case 'transition-to-second':
				this.transitionToSecondLevel();
				return;
			case 'transition-to-third':
				this.transitionToThirdLevel();
				return;
			case 'transition-to-fourth':
				this.transitionToFourthLevel();
				return;
			case 'start-npc-dialogue':
				this.startNpcDialogue();
				return;
			case 'kill-enemy-unlock-red':
				this.killEnemyUnlockRed();
				return;
			case 'start-yellow-quiz':
				this.startYellowUnlockQuiz();
				return;
			case 'complete-fourth-level':
				this.completeFourthLevel();
				return;
			case 'emit-gate-locked':
				const exitTile = this.levels[this.currentLevel].exitTile;
				if (exitTile) {
					EventBus.emit('dungeon:interactable-activated', {
						level: this.currentLevel,
						type: 'button',
						position: { x: exitTile.x, y: exitTile.y },
						message: 'The gate is sealed. Press every floor button with push blocks.',
						durationMs: 2200
					});
				}
				return;
			case 'activate-nearby-interactable':
			default:
				this.tryActivateNearbyInteractable();
				return;
		}
	}

	private unlockBlueChannel() {
		if (this.blueUnlocked) {
			return;
		}

		this.blueUnlocked = true;
		if (this.currentLevel === DUNGEON_LEVEL.ONE) {
			this.state = 'level-one-blue-unlocked';
		}
		this.emitWorldColorFilterState();
		this.cameras.main.flash(300, 90, 130, 255);

		if (this.currentLevel === DUNGEON_LEVEL.FOUR && !this.isNpcDialogueActive && this.npcs.length > 0) {
			const npcDialogue = this.levels[this.currentLevel].npcDialogue;
			if (npcDialogue?.postUnlockDialogue && npcDialogue.postUnlockDialogue.length > 0) {
				const dialogueLines = this.getResolvedPostUnlockDialogueLines(npcDialogue);
				if (dialogueLines.length === 0) {
					return;
				}

				this.isNpcDialogueActive = true;
				EventBus.emit('dungeon:dialogue-requested', {
					npcName: npcDialogue.name,
					dialogueLines,
					portraitAsset: npcDialogue.portraitAsset,
					onCompleteQuizId: null
				});
			}
		}
	}

	private startNpcDialogue() {
		const level = this.levels[this.currentLevel];
		if (!level.npcDialogue || this.npcs.length === 0) {
			return;
		}

		const hasPostUnlockDialogue = this.shouldUsePostUnlockDialogue(level.npcDialogue);
		if (hasPostUnlockDialogue && level.npcDialogue.postUnlockDialogue) {
			const dialogueLines = this.getResolvedPostUnlockDialogueLines(level.npcDialogue);
			if (dialogueLines.length === 0) {
				return;
			}

			this.isNpcDialogueActive = true;

			EventBus.emit('dungeon:dialogue-requested', {
				npcName: level.npcDialogue.name,
				dialogueLines,
				portraitAsset: level.npcDialogue.portraitAsset,
				onCompleteQuizId: null
			});
			return;
		}

		const interactionCount = this.npcDialogueInteractionCountByLevel.get(this.currentLevel) ?? 0;
		const interactionMode = level.npcDialogue.interactionMode
			?? (level.npcDialogue.alternateDialogues && level.npcDialogue.alternateDialogues.length > 0
				? 'alternate-after-first'
				: 'always-repeat');

		if (interactionMode === 'once' && interactionCount > 0) {
			return;
		}

		if (interactionMode === 'once-then-quiz' && interactionCount > 0) {
			this.startConfiguredNpcQuiz(level.npcDialogue.quizAfter ?? null);
			return;
		}

		let dialogueLines = level.npcDialogue.dialogue;
		if (interactionMode === 'alternate-after-first') {
			const dialogueVariants = [level.npcDialogue.dialogue, ...(level.npcDialogue.alternateDialogues ?? [])];
			const dialogueIndex = dialogueVariants.length > 1
				? interactionCount % dialogueVariants.length
				: 0;
			dialogueLines = dialogueVariants[dialogueIndex] ?? level.npcDialogue.dialogue;
		}

		this.isNpcDialogueActive = true;
		this.npcDialogueInteractionCountByLevel.set(this.currentLevel, interactionCount + 1);
		const onCompleteQuizId = level.npcDialogue.startQuizAfterDialogue
			? (level.npcDialogue.quizAfter ?? null)
			: null;

		EventBus.emit('dungeon:dialogue-requested', {
			npcName: level.npcDialogue.name,
			dialogueLines,
			portraitAsset: level.npcDialogue.portraitAsset,
			onCompleteQuizId
		});
	}

	private startConfiguredNpcQuiz(quizId: 'blue' | 'yellow' | null) {
		if (!quizId || quizId !== 'yellow') {
			return;
		}

		this.startYellowUnlockQuiz();
	}

	private shouldUsePostUnlockDialogue(npcDialogue: NonNullable<DungeonLevelConfig['npcDialogue']>): boolean {
		if (!npcDialogue.postUnlockDialogue || npcDialogue.postUnlockDialogue.length === 0) {
			return false;
		}

		if (this.currentLevel === DUNGEON_LEVEL.THREE && this.state === 'level-three-yellow-unlocked') {
			return true;
		}

		if (this.currentLevel === DUNGEON_LEVEL.FOUR && this.blueUnlocked) {
			return true;
		}

		return false;
	}

	private getResolvedPostUnlockDialogueLines(
		npcDialogue: NonNullable<DungeonLevelConfig['npcDialogue']>
	): string[] {
		const lines = npcDialogue.postUnlockDialogue ?? [];
		if (lines.length === 0) {
			return [];
		}

		if (this.currentLevel === DUNGEON_LEVEL.FOUR && this.blueUnlocked) {
			const randomLine = Phaser.Utils.Array.GetRandom(lines);
			return randomLine ? [randomLine] : [];
		}

		return lines;
	}

	private applyLerdilsonCelebrationSpin(delta: number) {
		if (this.currentLevel !== DUNGEON_LEVEL.FOUR || !this.blueUnlocked || this.npcs.length === 0) {
			this.lerdilsonSpinElapsedMs = 0;
			return;
		}

		const npcDialogue = this.levels[this.currentLevel].npcDialogue;
		if (npcDialogue?.name !== 'Lerdilson') {
			this.lerdilsonSpinElapsedMs = 0;
			return;
		}

		this.lerdilsonSpinElapsedMs += delta;
		const frameIndex = Math.floor(this.lerdilsonSpinElapsedMs / SPIN_FRAME_DURATION_MS) % SPIN_DIRECTIONS.length;
		const facing = SPIN_DIRECTIONS[frameIndex] ?? 'south';
		const jumpPhase = (this.lerdilsonSpinElapsedMs % LERDILSON_JUMP_PERIOD_MS) / LERDILSON_JUMP_PERIOD_MS;
		const jumpOffset = Math.abs(Math.sin(jumpPhase * Math.PI * 2)) * LERDILSON_JUMP_AMPLITUDE;

		for (const npc of this.npcs) {
			npc.facing = facing;
			syncNpcSprite(npc, (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY), false);
			npc.sprite.setY(npc.sprite.y - jumpOffset);
		}
	}

	private startYellowUnlockQuiz() {
		if (this.yellowUnlocked || this.isDungeonQuizActive || this.currentLevel !== DUNGEON_LEVEL.THREE || this.npcs.length === 0) {
			return;
		}

		this.isDungeonQuizActive = true;
		this.activeDungeonQuizId = 'yellow';
		EventBus.emit('dungeon:quiz-requested', {
			quizId: 'yellow',
			segment: 2,
			questionCount: this.yellowQuizQuestionCount
		});
	}

	private handleDungeonQuizFinished(quizId: 'blue' | 'yellow', passed: boolean, _correctAnswers: number) {
		if (!this.isDungeonQuizActive || this.activeDungeonQuizId !== quizId) {
			return;
		}

		this.isDungeonQuizActive = false;
		this.activeDungeonQuizId = null;

		if (quizId !== 'yellow') {
			return;
		}

		if (this.currentLevel !== DUNGEON_LEVEL.THREE || this.yellowUnlocked) {
			return;
		}

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
		return resolveWorldColorFilterMode({
			redUnlocked: this.redUnlocked,
			yellowUnlocked: this.yellowUnlocked,
			blueUnlocked: this.blueUnlocked,
			currentLevel: this.currentLevel
		});
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
		this.cameras.main.shake(260, 0.004);
		EventBus.emit('dungeon:interactable-activated', {
			level: this.currentLevel,
			type: 'button',
			position: { ...this.levels[this.currentLevel].exitTile! },
			message: 'All buttons activated. The dungeon challenge is complete.',
			durationMs: 2200
		});
		EventBus.emit('dungeon:final-celebration-requested', {
			durationMs: 5200,
			headline: 'TODAS AS CORES DESBLOQUEADAS!',
			subheadline: 'O mundo voltou a brilhar. Você concluiu a torre cromática.'
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
		const upgrades = getUpgrades();
		this.blueSwordActive = upgrades.blueSwordUnlocked;
		
		const enemyNpcs = this.npcs.filter((npc) => npc.health > 0 && npc.isEnemy);

		if (enemyNpcs.length > 0) {
			const nearestEnemy = findNearestEnemy(enemyNpcs, this.player.gridPos);

			if (nearestEnemy) {
				this.weaponCooldown -= delta;

				if (this.weaponCooldown <= 0) {
					const playerWorld = isoToWorld(this.player.gridPos.x, this.player.gridPos.y);

					if (this.blueSwordActive) {
						this.performBlueSwordSlash(playerWorld, isoToWorld);
						this.weaponCooldown = getBlueSwordCooldown(upgrades.blueSwordCooldownLevel);
					} else {
						const snowball = fireSnowball(this, playerWorld, nearestEnemy.gridPos, isoToWorld);
						if (snowball) {
							snowball.targetNpc = nearestEnemy;
							this.snowballs.push(snowball);
							this.weaponCooldown = getSnowballCooldown(upgrades.snowballCooldownLevel);
							snowball.damage = getSnowballDamage(upgrades.snowballDamageLevel);
						}
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
					this.hideExclamationIndicators();
					damageEnemy(snowball.targetNpc, snowball.damage);
					snowball.active = false;
					snowball.graphics.destroy();

					if (snowball.targetNpc.health <= 0) {
						this.handleEnemyKilled(snowball.targetNpc);
					}
				}
			}

			if (!snowball.active) {
				this.snowballs.splice(i, 1);
			}
		}
	}

	private handleEnemyKilled(npc: NpcState): void {
		npc.sprite.destroy();
		npc.healthBarBg.destroy();
		npc.healthBarFill.destroy();

		const indicatorIndex = this.exclamationIndicators.findIndex(ind => ind.npc === npc);
		if (indicatorIndex > -1) {
			this.exclamationIndicators[indicatorIndex].graphic.destroy();
			this.exclamationIndicators.splice(indicatorIndex, 1);
		}

		const index = this.npcs.indexOf(npc);
		if (index > -1) {
			this.npcs.splice(index, 1);
		}

		const isBoss = npc.id && npc.id.includes('boss');
		if (isBoss && this.currentWave === 2) {
			const upgrades = getUpgrades();
			if (!upgrades.blueSwordUnlocked) {
				upgrades.blueSwordUnlocked = true;
				saveUpgrades(upgrades);
			}
		}

		const points = (npc as NpcState & { customPoints?: number }).customPoints ?? this.POINTS_PER_KILL;
		this.score += points;

		if (this.npcs.length > 0 || this.currentLevel !== DUNGEON_LEVEL.TWO || this.redUnlocked) {
			return;
		}

		if (this.currentWave < this.WAVE_CONFIGS.length - 1) {
			this.currentWave += 1;
			this.showWaveCountdown(10);
			this.time.delayedCall(10000, () => {
				this.spawnWaveWithIndicator(this.currentWave);
			});
			return;
		}

		this.killEnemyUnlockRed();
	}

	private activeSwordSlash: {
		graphics: Phaser.GameObjects.Graphics;
		hitEnemies: Set<NpcState>;
		duration: number;
		elapsed: number;
		damage: number;
		reach: number;
	} | null = null;

	private performBlueSwordSlash(
		playerWorld: { x: number; y: number },
		_isoToWorld: (x: number, y: number) => { x: number; y: number }
	): void {
		if (this.activeSwordSlash) {
			this.activeSwordSlash.graphics.destroy();
		}

		const upgrades = getUpgrades();
		const SWORD_COLOR = 0x4a9eff;
		const arcAngle = getBlueSwordArcAngle(upgrades.blueSwordCooldownLevel);
		const reach = 3;
		const damage = getBlueSwordDamage(upgrades.blueSwordDamageLevel);

		const facing = this.player.facing;
		const DIRECTION_TO_ANGLE: Record<string, number> = {
			north: -90,
			'north-east': -45,
			east: 0,
			'south-east': 45,
			south: 90,
			'south-west': 135,
			west: 180,
			'north-west': -135,
		};
		const angle = DIRECTION_TO_ANGLE[facing] ?? 0;
		const angleRad = Phaser.Math.DegToRad(angle);

		const graphics = this.add.graphics();
		graphics.lineStyle(8, SWORD_COLOR, 1);
		graphics.fillStyle(SWORD_COLOR, 0.3);

		const startAngle = angleRad - Phaser.Math.DegToRad(arcAngle / 2);
		const endAngle = angleRad + Phaser.Math.DegToRad(arcAngle / 2);
		const radius = reach * 32;

		graphics.beginPath();
		graphics.arc(playerWorld.x, playerWorld.y, radius, startAngle, endAngle, false);
		graphics.strokePath();

		graphics.beginPath();
		graphics.moveTo(playerWorld.x, playerWorld.y);
		graphics.arc(playerWorld.x, playerWorld.y, radius, startAngle, endAngle, false);
		graphics.lineTo(playerWorld.x, playerWorld.y);
		graphics.closePath();
		graphics.fillPath();

		graphics.setDepth(playerWorld.y + 5);

		this.activeSwordSlash = {
			graphics,
			hitEnemies: new Set(),
			duration: 200,
			elapsed: 0,
			damage,
			reach,
		};

		this.checkSwordSlashHits(arcAngle);

		this.time.delayedCall(200, () => {
			if (this.activeSwordSlash) {
				this.activeSwordSlash.graphics.destroy();
				this.activeSwordSlash = null;
			}
		});
	}

	private checkSwordSlashHits(arcAngle: number): void {
		if (!this.activeSwordSlash) return;

		const { hitEnemies, damage, reach } = this.activeSwordSlash;
		const playerGridPos = this.player.gridPos;

		const facing = this.player.facing;
		const DIRECTION_TO_ANGLE: Record<string, number> = {
			north: -90,
			'north-east': -45,
			east: 0,
			'south-east': 45,
			south: 90,
			'south-west': 135,
			west: 180,
			'north-west': -135,
		};
		const angle = DIRECTION_TO_ANGLE[facing] ?? 0;
		const angleRad = Phaser.Math.DegToRad(angle);
		const halfArc = Phaser.Math.DegToRad(arcAngle / 2);

		for (const enemy of this.npcs) {
			if (enemy.health <= 0) continue;
			if (hitEnemies.has(enemy)) continue;

			const dx = enemy.gridPos.x - playerGridPos.x;
			const dy = enemy.gridPos.y - playerGridPos.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > reach) continue;

			const enemyAngle = Math.atan2(dy, dx);
			let angleDiff = enemyAngle - angleRad;
			while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
			while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

			if (Math.abs(angleDiff) <= halfArc) {
				damageEnemy(enemy, damage);
				hitEnemies.add(enemy);

				if (enemy.health <= 0) {
					this.handleEnemyKilled(enemy);
				}
			}
		}
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
				message: 'O bloco não pode ser movido nessa direção.',
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
				? 'O bloco deslizou até colidir.'
				: 'O bloco foi empurrado.',
			durationMs: 1700
		});

		return true;
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

		if (this.currentLevel === DUNGEON_LEVEL.FOUR && this.areAllButtonsPressed() && !this.blueUnlocked) {
			this.unlockBlueChannel();
		}

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
		const exitAvailable = resolveExitAvailableForLevel({
			levelId: this.currentLevel,
			redUnlocked: this.redUnlocked,
			yellowUnlocked: this.yellowUnlocked,
			allButtonsPressed: this.areAllButtonsPressed()
		});
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

				const exitAvailable = resolveExitAvailableForLevel({
					levelId: this.currentLevel,
					redUnlocked: this.redUnlocked,
					yellowUnlocked: this.yellowUnlocked,
					allButtonsPressed: this.areAllButtonsPressed()
				});
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

	private initializeCollectiblesForLevel() {
		// Clear any previous collectibles
		clearAllCollectibles(this.spawnedCollectibles);
		this.collectedCollectibleIds.clear();
		this.totalCollectiblesForLevel = 0;

		// Load collectibles for this level
		const levelConfig = COLLECTIBLE_CONFIGS[this.currentLevel];
		if (!levelConfig) {
			EventBus.emit('dungeon:collectibles-cleared', {
				levelId: this.currentLevel
			});
			return; // This level has no collectibles
		}

		// Spawn collectible items with proper isometric positioning
		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		this.spawnedCollectibles = spawnCollectibles(this, levelConfig.spawns, isoToWorld);

		// Track total for this level
		this.totalCollectiblesForLevel = levelConfig.spawns.length;

		// Emit event to React UI with theme data
		EventBus.emit('dungeon:collectibles-spawned', {
			levelId: this.currentLevel,
			collectibles: levelConfig.spawns.map(spawn => ({
				id: spawn.id,
				text: spawn.text,
				position: spawn.position
			})),
			fullText: levelConfig.fullText,
			keywords: levelConfig.keywords,
			themeTitle: levelConfig.themeTitle
		});
	}

	private updateCollectiblesOverlap() {
		if (this.spawnedCollectibles.size === 0) {
			return; // No collectibles for this level
		}

		const newlyCollected = updateCollectibleOverlap(
			this.player.gridPos,
			this.spawnedCollectibles,
			this.collectedCollectibleIds
		);

		// Handle each newly collected item
		for (const itemId of newlyCollected) {
			this.collectedCollectibleIds.add(itemId);

			const entry = this.spawnedCollectibles.get(itemId);
			if (!entry) continue;

			const { item } = entry;

			// Remove from world with animation
			removeCollectibleFromWorld(this, this.spawnedCollectibles, itemId);

			// Emit event to React UI with stable total count
			EventBus.emit('dungeon:collectible-picked-up', {
				itemId: item.id,
				itemText: item.text,
				originalCase: item.originalCase,
				keywordIndex: item.keywordIndex,
				collectedCount: this.collectedCollectibleIds.size,
				totalCount: this.totalCollectiblesForLevel
			});
		}
	}

	private spawnWaveWithIndicator(waveIndex: number) {
		const config = this.WAVE_CONFIGS[waveIndex];
		const isoToWorld = (isoX: number, isoY: number) => this.isoToWorld(isoX, isoY);
		const positions = this.getWaveSpawnPositions(config.enemyCount + (config.bossHealth ? 1 : 0));

		this.showSpawnIndicators(positions, isoToWorld);

		this.time.delayedCall(2000, () => {
			this.hideSpawnIndicators();
			this.spawnWaveWithExclamationAndTooltip(positions, isoToWorld);
		});
	}

	private showWaveCountdown(seconds: number) {
		if (this.waveCountdownText) {
			this.waveCountdownText.destroy();
		}
		if (this.waveCountdownTimer) {
			this.waveCountdownTimer.remove();
		}

		const textX = this.cameras.main.width - 150;
		const textY = 50;

		this.waveCountdownText = this.add.text(
			textX,
			textY,
			`Tempo ate a proxima horda: ${seconds}s`,
			{
				fontSize: '22px',
				fontFamily: 'Arial',
				color: '#ffff00',
				backgroundColor: '#000000dd',
				padding: { x: 16, y: 10 }
			}
		);
		this.waveCountdownText.setOrigin(0.5, 0);
		this.waveCountdownText.setDepth(1000);
		this.waveCountdownText.setScrollFactor(0);

		let remaining = seconds;
		this.waveCountdownTimer = this.time.addEvent({
			delay: 1000,
			callback: () => {
				remaining -= 1;
				if (remaining > 0 && this.waveCountdownText) {
					this.waveCountdownText.setText(`Tempo ate a proxima horda: ${remaining}s`);
				} else if (remaining <= 0 && this.waveCountdownText) {
					this.waveCountdownText.setText('A horda esta chegando!');
				}
			},
			repeat: seconds
		});
	}

	private hideWaveCountdown() {
		if (this.waveCountdownTimer) {
			this.waveCountdownTimer.remove();
			this.waveCountdownTimer = null;
		}
		if (this.waveCountdownText) {
			this.waveCountdownText.destroy();
			this.waveCountdownText = null;
		}
	}

	private showSpawnIndicators(
		positions: { x: number; y: number }[],
		isoToWorld: (isoX: number, isoY: number) => { x: number; y: number }
	) {
		this.spawnIndicators = [];

		for (const pos of positions) {
			const world = isoToWorld(pos.x, pos.y);
			const indicator = this.add.image(world.x, world.y, 'marker-exclamation');
			indicator.setOrigin(0.5, 1);
			indicator.setScale(0.8);
			indicator.setDepth(world.y + 20);
			indicator.setAlpha(0);

			this.tweens.add({
				targets: indicator,
				alpha: 1,
				duration: 300,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut'
			});

			this.spawnIndicators.push(indicator);
		}
	}

	private hideSpawnIndicators() {
		for (const indicator of this.spawnIndicators) {
			this.tweens.killTweensOf(indicator);
			indicator.destroy();
		}
		this.spawnIndicators = [];
	}

	private spawnWaveWithExclamationAndTooltip(
		positions: { x: number; y: number }[],
		isoToWorld: (isoX: number, isoY: number) => { x: number; y: number }
	) {
		const config = this.WAVE_CONFIGS[this.currentWave];
		const level = this.levels[this.currentLevel];
		const behavior = {
			kind: 'enemy-chase' as const,
			speedMultiplier: 1,
			maxHealth: config.enemyHealth,
			moveSpeed: level.npcBehavior?.kind === 'enemy-chase' ? level.npcBehavior.moveSpeed : undefined
		};

		const waveIndex = this.currentWave;
		for (let i = 0; i < config.enemyCount; i += 1) {
			const npc = spawnNpc(this, positions[i], isoToWorld, true, behavior, `wave-${waveIndex}-enemy-${i}`);
			(npc as NpcState & { customPoints?: number }).customPoints = config.enemyPoints;
			npc.healthBarBg.setVisible(true);
			npc.healthBarFill.setVisible(true);
			this.npcs.push(npc);
		}

		if (config.bossHealth) {
			const bossIndex = config.enemyCount;
			const boss = spawnNpc(
				this,
				positions[bossIndex],
				isoToWorld,
				true,
				{ ...behavior, maxHealth: config.bossHealth, speedMultiplier: 0.7 },
				`wave-${waveIndex}-boss`
			);
			(boss as NpcState & { customPoints?: number }).customPoints = config.bossPoints;
			boss.scale = 1.5;
			boss.sprite.setScale(PLAYER_SCALE * 1.5);
			boss.healthBarBg.setVisible(true);
			boss.healthBarFill.setVisible(true);
			this.npcs.push(boss);
		}

		this.rebuildCollisionMap();
		this.hideWaveCountdown();

		if (this.currentWave === 0) {
			this.isLevelTwoIntroFrozen = true;
			this.showExclamationIndicators();
			this.showLevelTwoEnemyDialogue();
			return;
		}

		this.showExclamationIndicators();
	}

	private showExclamationIndicators() {
		this.exclamationIndicators = [];

		for (const npc of this.npcs) {
			const world = this.isoToWorld(npc.gridPos.x, npc.gridPos.y);
			const exclamation = this.add.image(world.x, world.y - TILE_HEIGHT * 1.5, 'marker-exclamation');
			exclamation.setOrigin(0.5, 1);
			exclamation.setScale(0.8);
			exclamation.setDepth(world.y + 20);

			this.tweens.add({
				targets: exclamation,
				y: exclamation.y - 10,
				alpha: 0.3,
				duration: 400,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut'
			});

			this.exclamationIndicators.push({ graphic: exclamation, npc });
		}

		this.showWaveAnnouncementTooltip();
	}

	private showLevelTwoEnemyDialogue() {
		if (this.currentLevel !== DUNGEON_LEVEL.TWO) {
			return;
		}

		const level = this.levels[DUNGEON_LEVEL.TWO];
		if (!level.npcDialogue) {
			return;
		}

		this.isNpcDialogueActive = true;
		EventBus.emit('dungeon:dialogue-requested', {
			npcName: level.npcDialogue.name,
			dialogueLines: level.npcDialogue.dialogue,
			portraitAsset: level.npcDialogue.portraitAsset,
			onCompleteQuizId: null
		});
	}

	private hideExclamationIndicators() {
		for (const { graphic } of this.exclamationIndicators) {
			this.tweens.killTweensOf(graphic);
			graphic.destroy();
		}
		this.exclamationIndicators = [];
	}

	private updateExclamationIndicatorPositions() {
		for (const { graphic, npc } of this.exclamationIndicators) {
			const world = this.isoToWorld(npc.gridPos.x, npc.gridPos.y);
			graphic.x = world.x;
			graphic.y = world.y - TILE_HEIGHT * 1.5;
			graphic.setDepth(world.y + 20);
		}
	}

	private showWaveAnnouncementTooltip() {
		EventBus.emit('dungeon:show-tip', {
			message: 'Aproxime-se dos inimigos para causar-lhes dano',
			durationMs: 4000
		});
	}

	private getWaveSpawnPositions(count: number): { x: number; y: number }[] {
		const positions: { x: number; y: number }[] = [];
		const centerX = Math.floor(this.mapWidth / 2);
		const centerY = Math.floor(this.mapHeight / 2);
		const radius = Math.max(3, Math.min(this.mapWidth, this.mapHeight) / 3);

		for (let i = 0; i < count; i += 1) {
			let attempts = 0;
			let pos: { x: number; y: number } | null = null;

			while (attempts < 20) {
				const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
				const dist = radius * (0.5 + Math.random() * 0.5);
				const x = Math.round(centerX + Math.cos(angle) * dist);
				const y = Math.round(centerY + Math.sin(angle) * dist);

				if (x >= 1 && x < this.mapWidth - 1 && y >= 1 && y < this.mapHeight - 1 && this.map[y]?.[x] === 0) {
					const tooClose = positions.some((existingPos) => Math.hypot(existingPos.x - x, existingPos.y - y) < 2);
					if (!tooClose) {
						pos = { x, y };
						break;
					}
				}

				attempts += 1;
			}

			if (pos) {
				positions.push(pos);
			} else {
				positions.push({
					x: centerX + (i % 5) - 2,
					y: centerY + Math.floor(i / 5) - 2
				});
			}
		}

		return positions;
	}
}
