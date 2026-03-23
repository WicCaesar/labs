import Phaser from "phaser";
import { SCENE_KEYS } from "../../shared/constants/sceneKeys";
import { EventBus } from "../../shared/events/EventBus";
import type { WorldColorFilterMode } from "../../shared/events/EventBus";
import { DungeonRenderer } from "./isometricDungeon/DungeonRenderer";
import {
  INTERACTION_DISTANCE,
  TILE_HEIGHT,
  TILE_WIDTH,
} from "./isometricDungeon/constants";
import {
  findPushBlockAtTile,
  getPushDeltaFromFacing,
  spawnPushBlock,
  syncPushBlockSprite,
  type PushBlockState,
} from "./isometricDungeon/pushBlocks";
import {
  createLevelConfig,
  DUNGEON_LEVEL,
  type DungeonInteractableMarker,
  type DungeonLevelConfig,
  type DungeonLevelId,
  type DungeonState,
} from "./isometricDungeon/levelConfig";
import type { DungeonMarker } from "./isometricDungeon/dungeonMapParser";
import { distanceBetween, isWalkable } from "./isometricDungeon/navigation";
import type { Vec2 } from "./isometricDungeon/types";
import {
  spawnNpc,
  syncNpcSprite,
  type NpcState,
  updateEnemyNpcMovement,
  updateNpcMovement,
} from "./isometricDungeon/npc";
import {
  spawnPlayer,
  syncPlayerSprite,
  type PlayerState,
  updatePlayerMovement,
} from "./isometricDungeon/player";
import { resolveDungeonInteractionAction } from "./isometricDungeon/interactionState";
import { WeaponManager } from "./isometricDungeon/weapons/WeaponManager";
import { SnowballWeapon } from "./isometricDungeon/weapons/SnowballWeapon";
import { BlueSwordWeapon } from "./isometricDungeon/weapons/BlueSwordWeapon";
import {
  resolveExitAvailableForLevel,
  resolveStateForLevelLoad,
  resolveWorldColorFilterMode,
} from "./isometricDungeon/progressionState";
import { COLLECTIBLE_CONFIGS } from "../../shared/constants/collectibleConfig";
import {
  spawnCollectibles,
  updateCollectibleOverlap,
  removeCollectibleFromWorld,
  clearAllCollectibles,
} from "./isometricDungeon/collectibles";
import type { CollectibleItem } from "../../shared/types/collectibles";

export class IsometricDungeon extends Phaser.Scene {
  private readonly map: number[][] = [];

  private readonly collisionMap: number[][] = [];

  private levels!: Record<DungeonLevelId, DungeonLevelConfig>;

  private currentLevel: DungeonLevelId = DUNGEON_LEVEL.ONE;

  private state: DungeonState = "level-one-hunt-blue";

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

  private spawnedCollectibles: Map<
    string,
    { item: CollectibleItem; graphics: Phaser.GameObjects.Text }
  > = new Map();

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

  private activeDungeonQuizId: "blue" | "yellow" | null = null;

  private readonly blueQuizQuestionCount = 3;

  private readonly yellowQuizQuestionCount = 3;

  private readonly unsubscribeHandlers: Array<() => void> = [];

  private weaponManager!: WeaponManager;

  private worldOffsetX = 0;

  private worldOffsetY = 0;

  private score = 0;

  private readonly POINTS_PER_KILL = 10;

  constructor() {
    super(SCENE_KEYS.ISOMETRIC_DUNGEON);
  }

  preload() {
    this.load.setPath("assets/sprites/penguin/rotations");
    this.load.image("penguin-north", "north.png");
    this.load.image("penguin-north-east", "north-east.png");
    this.load.image("penguin-east", "east.png");
    this.load.image("penguin-south-east", "south-east.png");
    this.load.image("penguin-south", "south.png");
    this.load.image("penguin-south-west", "south-west.png");
    this.load.image("penguin-west", "west.png");
    this.load.image("penguin-north-west", "north-west.png");
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

    // Initialize weapon system
    this.weaponManager = new WeaponManager();
    this.weaponManager.addWeapon(new SnowballWeapon());

    // 🧪 TESTE: Para testar a Espada Azul antes de completar todos os desafios,
    // descomente a linha abaixo:
    this.weaponManager.addWeapon(new BlueSwordWeapon());

    this.unsubscribeHandlers.push(
      EventBus.on(
        "ui:dungeon-quiz-finished",
        ({ quizId, passed, correctAnswers }) => {
          this.handleDungeonQuizFinished(quizId, passed, correctAnswers);
        },
      ),
      EventBus.on("ui:dungeon-quiz-cancelled", ({ quizId }) => {
        this.handleDungeonQuizCancelled(quizId);
      }),
      EventBus.on(
        "dungeon:dialogue-finished",
        ({ shouldStartQuiz, quizId }) => {
          if (shouldStartQuiz && quizId === "blue") {
            this.startBlueUnlockQuiz();
          }
        },
      ),
    );
    this.emitWorldColorFilterState();

    this.scale.on("resize", this.handleResize, this);
    this.events.once("shutdown", () => {
      this.stopExitSparkleLoop();
      this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
      this.unsubscribeHandlers.length = 0;
      EventBus.emit("world:color-filter-state-changed", { mode: "none" });
      this.scale.off("resize", this.handleResize, this);
    });
  }

  update(_: number, delta: number) {
    if (this.isDungeonQuizActive) {
      return;
    }

    const isoToWorld = (isoX: number, isoY: number) =>
      this.isoToWorld(isoX, isoY);
    const move = this.getMovementInput();
    this.rebuildCollisionMap();
    updatePlayerMovement(
      this.player,
      move,
      delta,
      this.collisionMap,
      this.mapWidth,
      this.mapHeight,
    );
    syncPlayerSprite(this.player, isoToWorld);
    const playerWorld = this.isoToWorld(
      this.player.gridPos.x,
      this.player.gridPos.y,
    );
    this.cameras.main.centerOn(playerWorld.x, playerWorld.y);

    const levelNpcRole = this.levels[this.currentLevel].npcRole;
    const isEnemyLevel = levelNpcRole === "enemy";
    const allEnemiesDefeated =
      this.npcs.length === 0 || this.npcs.every((npc) => npc.health <= 0);

    for (const npc of this.npcs) {
      if (
        this.state === "level-two-hunt-red" &&
        !allEnemiesDefeated &&
        isEnemyLevel
      ) {
        updateEnemyNpcMovement(
          npc,
          this.player.gridPos,
          delta,
          this.collisionMap,
          this.mapWidth,
          this.mapHeight,
        );
        this.handleEnemyTouchDamage();
      } else {
        updateNpcMovement(
          npc,
          delta,
          this.collisionMap,
          this.mapWidth,
          this.mapHeight,
        );
      }
    }

    for (const npc of this.npcs) {
      syncNpcSprite(
        npc,
        isoToWorld,
        this.currentLevel === DUNGEON_LEVEL.TWO && !allEnemiesDefeated,
      );
    }

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
      yellowUnlocked: this.yellowUnlocked,
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
    console.log(
      "drawDungeon() called, map:",
      this.map.length,
      "rows, worldOffset:",
      this.worldOffsetX,
      this.worldOffsetY,
    );
    if (!this.map || this.map.length === 0) {
      console.error("ERROR: Map is empty or undefined!");
      return;
    }
    this.dungeonRenderer.draw(this.map, this.worldOffsetX, this.worldOffsetY);
    console.log("drawDungeon() completed");
  }

  private spawnActorsForLevel() {
    console.log("spawnActorsForLevel() started");
    const level = this.levels[this.currentLevel];
    console.log("Current level:", this.currentLevel, "Level data:", level);
    const isoToWorld = (isoX: number, isoY: number) =>
      this.isoToWorld(isoX, isoY);

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

    const isEnemy = level.npcRole === "enemy";
    if (level.npcSpawns.length > 0 && level.npcBehavior) {
      for (const spawnPos of level.npcSpawns) {
        const npcSpawn = this.ensureWalkable(spawnPos);
        const npc = spawnNpc(
          this,
          npcSpawn,
          isoToWorld,
          isEnemy,
          level.npcBehavior,
        );
        const hideDefeatedEnemyNpc =
          this.currentLevel === DUNGEON_LEVEL.TWO && this.redUnlocked;
        npc.sprite.setVisible(!hideDefeatedEnemyNpc);
        this.npcs.push(npc);
      }
    }

    for (const [index, spawn] of level.pushBlocks.entries()) {
      const blockId = `${this.currentLevel}-${spawn.kind}-${spawn.position.x}-${spawn.position.y}-${index}`;
      this.pushBlocks.push(
        spawnPushBlock(this, spawn.kind, spawn.position, isoToWorld, blockId),
      );
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
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as {
      up: Phaser.Input.Keyboard.Key;
      down: Phaser.Input.Keyboard.Key;
      left: Phaser.Input.Keyboard.Key;
      right: Phaser.Input.Keyboard.Key;
    };

    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
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
      y: screenY - screenX,
    };
  }

  private handleInteraction() {
    if (this.tryPushBlockInFacingDirection()) {
      return;
    }

    const action = resolveDungeonInteractionAction({
      state: this.state,
      redUnlocked: this.redUnlocked,
      nearExit: this.isNearLevelExit(),
      nearNpc: this.isPlayerNearNpc(),
      allButtonsPressed: this.areAllButtonsPressed(),
    });

    switch (action) {
      case "transition-to-second":
        this.transitionToSecondLevel();
        return;
      case "transition-to-third":
        this.transitionToThirdLevel();
        return;
      case "transition-to-fourth":
        this.transitionToFourthLevel();
        return;
      case "start-level-one-dialogue":
        this.startNpcDialogue();
        return;
      case "kill-enemy-unlock-red":
        this.killEnemyUnlockRed();
        return;
      case "start-yellow-quiz":
        this.startYellowUnlockQuiz();
        return;
      case "complete-fourth-level":
        this.completeFourthLevel();
        return;
      case "emit-gate-locked":
        const exitTile = this.levels[this.currentLevel].exitTile;
        if (exitTile) {
          EventBus.emit("dungeon:interactable-activated", {
            level: this.currentLevel,
            type: "button",
            position: { x: exitTile.x, y: exitTile.y },
            message:
              "The gate is sealed. Press every floor button with push blocks.",
            durationMs: 2200,
          });
        }
        return;
      case "activate-nearby-interactable":
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
      this.state = "level-one-blue-unlocked";
    }
    this.emitWorldColorFilterState();
    this.cameras.main.flash(300, 90, 130, 255);
  }

  private startNpcDialogue() {
    const level = this.levels[this.currentLevel];
    if (!level.npcDialogue || this.npcs.length === 0) {
      return;
    }

    EventBus.emit("dungeon:dialogue-requested", {
      npcName: level.npcDialogue.name,
      dialogueLines: level.npcDialogue.dialogue,
      portraitAsset: level.npcDialogue.portraitAsset,
      onCompleteQuizId: level.npcDialogue.quizAfter ?? null,
    });
  }

  private startBlueUnlockQuiz() {
    if (
      this.blueUnlocked ||
      this.isDungeonQuizActive ||
      this.currentLevel !== DUNGEON_LEVEL.ONE ||
      this.npcs.length === 0
    ) {
      return;
    }

    this.isDungeonQuizActive = true;
    this.activeDungeonQuizId = "blue";
    EventBus.emit("dungeon:quiz-requested", {
      quizId: "blue",
      segment: 1,
      questionCount: this.blueQuizQuestionCount,
    });
  }

  private startYellowUnlockQuiz() {
    if (
      this.yellowUnlocked ||
      this.isDungeonQuizActive ||
      this.currentLevel !== DUNGEON_LEVEL.THREE ||
      this.npcs.length === 0
    ) {
      return;
    }

    this.isDungeonQuizActive = true;
    this.activeDungeonQuizId = "yellow";
    EventBus.emit("dungeon:quiz-requested", {
      quizId: "yellow",
      segment: 2,
      questionCount: this.yellowQuizQuestionCount,
    });
  }

  private handleDungeonQuizFinished(
    quizId: "blue" | "yellow",
    passed: boolean,
    _correctAnswers: number,
  ) {
    if (!this.isDungeonQuizActive || this.activeDungeonQuizId !== quizId) {
      return;
    }

    this.isDungeonQuizActive = false;
    this.activeDungeonQuizId = null;

    if (quizId === "blue") {
      if (this.currentLevel !== DUNGEON_LEVEL.ONE || this.blueUnlocked) {
        return;
      }

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

    if (passed) {
      this.unlockYellowChannel();
      return;
    }

    this.cameras.main.shake(130, 0.006);
  }

  private handleDungeonQuizCancelled(quizId: "blue" | "yellow") {
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
    this.state = "level-two-red-unlocked";
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
    this.state = "level-three-yellow-unlocked";
    this.emitWorldColorFilterState();
    this.cameras.main.flash(420, 120, 255, 120);
    this.updateLevelMarker();

    // Desbloquear espada azul quando todas as cores forem obtidas
    this.checkAndUnlockBlueSword();
  }

  private checkAndUnlockBlueSword() {
    // Verifica se todas as 3 cores foram desbloqueadas
    if (this.blueUnlocked && this.redUnlocked && this.yellowUnlocked) {
      if (!this.weaponManager.hasWeapon("blue-sword")) {
        this.weaponManager.addWeapon(new BlueSwordWeapon());
        console.log(
          "[WEAPON] Espada Azul desbloqueada! Todas as cores foram obtidas.",
        );
      }
    }
  }

  private emitWorldColorFilterState() {
    EventBus.emit("world:color-filter-state-changed", {
      mode: this.getWorldColorFilterMode(),
    });
  }

  private getWorldColorFilterMode(): WorldColorFilterMode {
    return resolveWorldColorFilterMode({
      redUnlocked: this.redUnlocked,
      yellowUnlocked: this.yellowUnlocked,
      blueUnlocked: this.blueUnlocked,
      currentLevel: this.currentLevel,
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
    if (this.state === "complete") {
      return;
    }

    this.state = "complete";
    this.cameras.main.flash(420, 255, 220, 120);
    EventBus.emit("dungeon:interactable-activated", {
      level: this.currentLevel,
      type: "button",
      position: { ...this.levels[this.currentLevel].exitTile! },
      message: "All buttons activated. The dungeon challenge is complete.",
      durationMs: 2200,
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
      const nearEnemy =
        distanceBetween(this.player.gridPos, npc.gridPos) <= 0.75;
      if (nearEnemy) {
        this.lastPlayerHitAt = now;
        this.scene.stop();
        this.scene.start(SCENE_KEYS.DEATH_SCREEN, { score: this.score });
        return;
      }
    }
  }

	private updateWeaponSystem(
		delta: number,
		isoToWorld: (x: number, y: number) => { x: number; y: number },
	) {
		const isHostileLevel =
			this.currentLevel === DUNGEON_LEVEL.TWO && !this.redUnlocked;

		// SEMPRE atualizar o weaponManager para permitir que projéteis/slashes pendentes
		// sejam destruídos normalmente, mesmo quando o nível não é mais hostil
		this.weaponManager.update(delta, {
			scene: this,
			playerGridPos: this.player.gridPos,
			playerWorldPos: isoToWorld(
				this.player.gridPos.x,
				this.player.gridPos.y,
			),
			playerFacing: this.player.facing,
			enemies: isHostileLevel ? this.npcs : [], // Lista vazia se não é hostile
			isoToWorld,
			onEnemyKilled: (npc) => this.handleEnemyKilled(npc),
		});
	}

  private handleEnemyKilled(npc: NpcState): void {
    npc.sprite.destroy();
    npc.healthBarBg.destroy();
    npc.healthBarFill.destroy();

    const index = this.npcs.indexOf(npc);
    if (index > -1) {
      this.npcs.splice(index, 1);
    }

    this.score += this.POINTS_PER_KILL;

    if (this.npcs.length === 0) {
      this.killEnemyUnlockRed();
    }
  }

  private rebuildCollisionMap() {
    this.collisionMap.length = 0;
    for (let y = 0; y < this.mapHeight; y += 1) {
      this.collisionMap.push([...this.map[y]]);
    }

    // Push blocks are dynamic blockers layered on top of static wall map data.
    for (const block of this.pushBlocks) {
      if (
        block.position.y < 0 ||
        block.position.y >= this.mapHeight ||
        block.position.x < 0 ||
        block.position.x >= this.mapWidth
      ) {
        continue;
      }

      this.collisionMap[block.position.y][block.position.x] = 1;
    }
  }

  private getRoundedPlayerTile(): Vec2 {
    return {
      x: Math.round(this.player.gridPos.x),
      y: Math.round(this.player.gridPos.y),
    };
  }

  private isTileInsideMap(tileX: number, tileY: number): boolean {
    return (
      tileX >= 0 &&
      tileY >= 0 &&
      tileX < this.mapWidth &&
      tileY < this.mapHeight
    );
  }

  private isTileBlockedForPush(
    tileX: number,
    tileY: number,
    ignoredBlockId?: string,
  ): boolean {
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
          y: Math.round(npc.gridPos.y),
        };
        if (npcTile.x === tileX && npcTile.y === tileY) {
          return true;
        }
      }
    }

    const level = this.levels[this.currentLevel];
    if (
      level.exitTile &&
      level.exitTile.x === tileX &&
      level.exitTile.y === tileY
    ) {
      return true;
    }

    for (const marker of level.markers) {
      if (marker.type === "button") {
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
      y: playerTile.y + pushDelta.y,
    };

    const block = findPushBlockAtTile(
      this.pushBlocks,
      frontTile.x,
      frontTile.y,
    );
    if (!block) {
      return false;
    }

    let destination: Vec2 | null = null;
    if (block.kind === "step") {
      // Step blocks move exactly one tile.
      const nextTile = {
        x: block.position.x + pushDelta.x,
        y: block.position.y + pushDelta.y,
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
          y: cursor.y + pushDelta.y,
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
      EventBus.emit("dungeon:interactable-activated", {
        level: this.currentLevel,
        type: "push-block",
        position: { ...block.position },
        message: "The block cannot move in that direction.",
        durationMs: 1700,
      });
      return true;
    }

    block.position = destination;
    syncPushBlockSprite(block, (isoX: number, isoY: number) =>
      this.isoToWorld(isoX, isoY),
    );
    this.rebuildCollisionMap();
    this.refreshButtonActivation(true);

    EventBus.emit("dungeon:interactable-activated", {
      level: this.currentLevel,
      type: "push-block",
      position: { ...destination },
      message:
        block.kind === "slide"
          ? "Sliding block moved until collision."
          : "Block pushed one tile.",
      durationMs: 1700,
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
    this.exitMarkerOuter = this.add
      .ellipse(0, 0, 30, 16, 0x2f3b45, 0.9)
      .setDepth(8);
    this.exitMarkerInner = this.add
      .ellipse(0, 0, 22, 11, 0x06080b, 0.96)
      .setDepth(8.1);
    this.updateLevelMarker();
  }

  private renderInteractableMarkers() {
    this.markerVisuals.forEach((visual) => visual.destroy());
    this.markerVisuals.length = 0;

    const level = this.levels[this.currentLevel];
    for (const marker of level.markers) {
      if (marker.type !== "interactable") {
        continue;
      }

      const world = this.isoToWorld(
        marker.position.x + 0.5,
        marker.position.y + 0.5,
      );
      const isActive = this.activatedInteractableKeys.has(
        this.getMarkerKey(this.currentLevel, marker),
      );
      const visual = this.add.ellipse(
        world.x,
        world.y - TILE_HEIGHT * 0.1,
        20,
        12,
        isActive ? 0x43a047 : 0x1f7fbf,
        isActive ? 0.45 : 0.8,
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
        0.96,
      );
      const shine = this.add.ellipse(
        -2.2,
        pressed ? 0.2 : -2.1,
        4,
        2,
        0xffffff,
        pressed ? 0.2 : 0.35,
      );

      const visual = this.add.container(world.x, buttonY, [
        plate,
        ring,
        cap,
        shine,
      ]);
      visual.setDepth(world.y + 6.6);
      this.buttonVisuals.push(visual);
    }
  }

  private getButtonMarkers(): Array<
    Extract<DungeonMarker, { type: "button" }>
  > {
    return this.levels[this.currentLevel].markers.filter(
      (marker) => marker.type === "button",
    );
  }

  private isButtonPressed(
    marker: Extract<DungeonMarker, { type: "button" }>,
  ): boolean {
    const key = this.getMarkerKey(this.currentLevel, marker);
    return this.pressedButtonKeys.has(key);
  }

  private refreshButtonActivation(emitEvents: boolean) {
    const nextPressedKeys = new Set<string>();
    for (const marker of this.getButtonMarkers()) {
      const hasBlock =
        findPushBlockAtTile(
          this.pushBlocks,
          marker.position.x,
          marker.position.y,
        ) !== null;
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

        EventBus.emit("dungeon:interactable-activated", {
          level: this.currentLevel,
          type: "button",
          position: marker.position,
          message: isPressed
            ? `Button pressed at (${marker.position.x}, ${marker.position.y}).`
            : `Button released at (${marker.position.x}, ${marker.position.y}).`,
          durationMs: 1800,
        });
      }
    }

    this.pressedButtonKeys.clear();
    nextPressedKeys.forEach((key) => this.pressedButtonKeys.add(key));
    this.renderButtonMarkers();

    if (
      this.currentLevel === DUNGEON_LEVEL.FOUR &&
      this.areAllButtonsPressed() &&
      !this.blueUnlocked
    ) {
      this.unlockBlueChannel();
    }

    if (this.currentLevel === DUNGEON_LEVEL.FOUR) {
      if (this.state !== "complete") {
        this.state = "level-four-button-puzzle";
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
      if (marker.type !== "interactable") {
        continue;
      }

      const markerCenter = {
        x: marker.position.x + 0.5,
        y: marker.position.y + 0.5,
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

  private getMarkerKey(
    levelId: DungeonLevelId,
    marker: Pick<DungeonMarker, "type" | "position">,
  ): string {
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

    EventBus.emit("dungeon:interactable-activated", {
      level: this.currentLevel,
      type: marker.type,
      position: marker.position,
      message: alreadyActivated
        ? `Interactable revisited at (${marker.position.x}, ${marker.position.y}).`
        : `Interacted with marker at (${marker.position.x}, ${marker.position.y}).`,
      durationMs: 2400,
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
      allButtonsPressed: this.areAllButtonsPressed(),
    });
    const markerY = world.y;
    const wasUnlocked =
      this.exitUnlockedByLevel.get(this.currentLevel) ?? false;
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
    this.exitMarkerInner.setPosition(
      world.x,
      markerY + (exitAvailable ? 0.5 : 0),
    );
    this.exitMarkerOuter.setFillStyle(
      exitAvailable ? 0x3b4a56 : 0x2b343c,
      exitAvailable ? 0.94 : 0.84,
    );
    this.exitMarkerInner.setFillStyle(
      exitAvailable ? 0x0d1218 : 0x171d23,
      exitAvailable ? 0.98 : 0.94,
    );
    this.exitMarkerOuter.setDepth(world.y + 7.9);
    this.exitMarkerInner.setDepth(world.y + 8);
  }

  private spawnExitUnlockSparkles(world: Vec2) {
    this.spawnExitSparklesAt(world, 14, true);
    this.cameras.main.flash(180, 120, 220, 255, false);
  }

  private spawnExitSparklesAt(
    world: Vec2,
    sparkleCount: number,
    strongBurst: boolean,
  ) {
    const sparkleColors = [0xff4fc3, 0x4fd8ff, 0xffe066, 0x7dff7d, 0xff8a65];

    for (let index = 0; index < sparkleCount; index += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const radius = Phaser.Math.Between(
        strongBurst ? 10 : 6,
        strongBurst ? 24 : 14,
      );
      const targetX = world.x + Math.cos(angle) * radius;
      const targetY =
        world.y +
        Math.sin(angle) * (radius * 0.42) -
        Phaser.Math.Between(8, strongBurst ? 20 : 14);
      const sparkle = this.add.circle(
        world.x + Phaser.Math.Between(-2, 2),
        world.y + Phaser.Math.Between(-2, 2),
        Phaser.Math.FloatBetween(
          strongBurst ? 1.8 : 1.2,
          strongBurst ? 3.2 : 2.3,
        ),
        sparkleColors[index % sparkleColors.length],
        strongBurst ? 0.95 : 0.8,
      );
      sparkle.setDepth(world.y + 9.5);

      this.tweens.add({
        targets: sparkle,
        x: targetX,
        y: targetY,
        alpha: 0,
        scale: 0.15,
        duration: Phaser.Math.Between(
          strongBurst ? 480 : 380,
          strongBurst ? 760 : 620,
        ),
        ease: "Cubic.easeOut",
        onComplete: () => sparkle.destroy(),
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
          allButtonsPressed: this.areAllButtonsPressed(),
        });
        if (!exitAvailable) {
          return;
        }

        const world = this.isoToWorld(level.exitTile.x, level.exitTile.y);
        this.spawnExitSparklesAt(world, Phaser.Math.Between(2, 4), false);
      },
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
      y: level.exitTile.y + 0.5,
    };

    return distanceBetween(this.player.gridPos, exitCenter) <= 1.1;
  }

  private isPlayerNearNpc(): boolean {
    if (this.npcs.length === 0) {
      return false;
    }

    for (const npc of this.npcs) {
      if (
        distanceBetween(this.player.gridPos, npc.gridPos) <=
        INTERACTION_DISTANCE
      ) {
        return true;
      }
    }
    return false;
  }

  private isoToWorld(isoX: number, isoY: number): Vec2 {
    return this.dungeonRenderer.isoToWorld(
      isoX,
      isoY,
      this.worldOffsetX,
      this.worldOffsetY,
    );
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
      mapPixelHeight + TILE_HEIGHT * 3,
    );
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const isoToWorld = (isoX: number, isoY: number) =>
      this.isoToWorld(isoX, isoY);
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
      syncNpcSprite(
        npc,
        isoToWorld,
        this.currentLevel === DUNGEON_LEVEL.TWO && !this.redUnlocked,
      );
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
      EventBus.emit("dungeon:collectibles-cleared", {
        levelId: this.currentLevel,
      });
      return; // This level has no collectibles
    }

    // Spawn collectible items with proper isometric positioning
    const isoToWorld = (isoX: number, isoY: number) =>
      this.isoToWorld(isoX, isoY);
    this.spawnedCollectibles = spawnCollectibles(
      this,
      levelConfig.spawns,
      isoToWorld,
    );

    // Track total for this level
    this.totalCollectiblesForLevel = levelConfig.spawns.length;

    // Emit event to React UI with theme data
    EventBus.emit("dungeon:collectibles-spawned", {
      levelId: this.currentLevel,
      collectibles: levelConfig.spawns.map((spawn) => ({
        id: spawn.id,
        text: spawn.text,
        position: spawn.position,
      })),
      fullText: levelConfig.fullText,
      keywords: levelConfig.keywords,
      themeTitle: levelConfig.themeTitle,
    });
  }

  private updateCollectiblesOverlap() {
    if (this.spawnedCollectibles.size === 0) {
      return; // No collectibles for this level
    }

    const newlyCollected = updateCollectibleOverlap(
      this.player.gridPos,
      this.spawnedCollectibles,
      this.collectedCollectibleIds,
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
      EventBus.emit("dungeon:collectible-picked-up", {
        itemId: item.id,
        itemText: item.text,
        originalCase: item.originalCase,
        keywordIndex: item.keywordIndex,
        collectedCount: this.collectedCollectibleIds.size,
        totalCount: this.totalCollectiblesForLevel,
      });
    }
  }
}
