import Phaser from "phaser";
import {
  DIRECTION_TO_FRAME,
  NPC_DIRECTION_MIN_MS,
  NPC_DIRECTION_MAX_MS,
  NPC_SPEED,
  PLAYER_SCALE,
  TILE_HEIGHT,
} from "./constants";
import {
  directionFromVector,
  projectIsoDirectionToScreen,
  randomDirection,
  tryMoveEntity,
} from "./navigation";
import type { DirectionKey, Vec2 } from "./types";
import type { DungeonNpcBehavior } from "./levelConfig";

type IsoToWorld = (isoX: number, isoY: number) => Vec2;

const NPC_FEET_OFFSET_Y = TILE_HEIGHT * 0.02;
const HEALTH_BAR_WIDTH = 36;
const HEALTH_BAR_HEIGHT = 5;
const HEALTH_BAR_OFFSET_Y = -TILE_HEIGHT * 1.8;

// Constantes de configuração para inimigos (podem ser sobrescritas via behavior)
export const DEFAULT_ENEMY_MAX_HEALTH = 50;
export const DEFAULT_ENEMY_MOVE_SPEED = 1.8;
export const DEFAULT_ENEMY_CATCH_DISTANCE = 0.5;
export const DEFAULT_ENEMY_SEPARATION_DISTANCE = 0.6;
export const DEFAULT_ENEMY_SEPARATION_FORCE = 0.3;

// Constantes internas (valores padrão quando não especificado)
const MAX_HEALTH = DEFAULT_ENEMY_MAX_HEALTH;
const ENEMY_MOVE_SPEED = DEFAULT_ENEMY_MOVE_SPEED;
const ENEMY_CATCH_DISTANCE = DEFAULT_ENEMY_CATCH_DISTANCE;
const ENEMY_SEPARATION_DISTANCE = DEFAULT_ENEMY_SEPARATION_DISTANCE;
const ENEMY_SEPARATION_FORCE = DEFAULT_ENEMY_SEPARATION_FORCE;

const LOOK_AROUND_DIRECTIONS: DirectionKey[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

export type FriendlyNpcBehavior =
  | {
      kind: "friendly-wander";
      speedMultiplier: number;
      decisionMinMs: number;
      decisionMaxMs: number;
    }
  | {
      kind: "friendly-stationary-fixed";
      facing: DirectionKey;
    }
  | {
      kind: "friendly-stationary-look-around";
      lookMinMs: number;
      lookMaxMs: number;
    };

export type EnemyNpcBehavior = {
  kind: "enemy-chase";
  speedMultiplier: number;
  maxHealth?: number; // Opcional, usa MAX_HEALTH como padrão
  moveSpeed?: number; // Opcional, usa ENEMY_MOVE_SPEED como padrão
};

export type NpcBehavior = FriendlyNpcBehavior | EnemyNpcBehavior;

export type NpcState = {
  id: string;
  gridPos: Vec2;
  facing: DirectionKey;
  direction: Vec2;
  sprite: Phaser.GameObjects.Image;
  decisionTimer: number;
  behavior: DungeonNpcBehavior;
  lookAroundTimer: number;
  health: number;
  maxHealth: number;
  healthBarBg: Phaser.GameObjects.Rectangle;
  healthBarFill: Phaser.GameObjects.Rectangle;
  isFrozen: boolean;
  frozenPosition: Vec2 | null;
  moveSpeed: number;
  pointsOnKill: number;
  scale: number;
  isEnemy: boolean;
};

let npcIdCounter = 0;

export function spawnNpc(
  scene: Phaser.Scene,
  spawnPosition: Vec2,
  isoToWorld: IsoToWorld,
  isEnemy: boolean,
  behavior: DungeonNpcBehavior,
  customId?: string,
): NpcState {
  const id = customId ?? `npc-${++npcIdCounter}`;
  const facing: DirectionKey = "south";
  const world = isoToWorld(spawnPosition.x, spawnPosition.y);
  const sprite = scene.add.image(
    world.x,
    world.y + NPC_FEET_OFFSET_Y,
    DIRECTION_TO_FRAME[facing],
  );

  sprite.setOrigin(0.5, 1);
  sprite.setScale(PLAYER_SCALE);
  sprite.setDepth(world.y + 9);

  if (isEnemy) {
    sprite.setTint(0xff3333);
  }

  const barWorldY = world.y + HEALTH_BAR_OFFSET_Y;
  const healthBarBg = scene.add.rectangle(
    world.x,
    barWorldY,
    HEALTH_BAR_WIDTH,
    HEALTH_BAR_HEIGHT,
    0x000000,
  );
  healthBarBg.setOrigin(0.5, 0.5);
  healthBarBg.setDepth(world.y + 10);
  healthBarBg.setVisible(false);

  const healthBarFill = scene.add.rectangle(
    world.x - HEALTH_BAR_WIDTH / 2 + HEALTH_BAR_WIDTH / 2,
    barWorldY,
    HEALTH_BAR_WIDTH,
    HEALTH_BAR_HEIGHT,
    0xffffff,
  );
  healthBarFill.setOrigin(0.5, 0.5);
  healthBarFill.setDepth(world.y + 11);
  healthBarFill.setVisible(false);

  const healthValue = isEnemy && behavior.kind === "enemy-chase" && behavior.maxHealth
    ? behavior.maxHealth
    : MAX_HEALTH;

  const moveSpeedValue = isEnemy && behavior.kind === "enemy-chase" && behavior.moveSpeed
    ? behavior.moveSpeed
    : ENEMY_MOVE_SPEED;

  return {
    id,
    gridPos: { ...spawnPosition },
    facing,
    direction: randomDirection(),
    sprite,
    decisionTimer: Phaser.Math.Between(
      NPC_DIRECTION_MIN_MS,
      NPC_DIRECTION_MAX_MS,
    ),
    behavior,
    lookAroundTimer:
      behavior.kind === "friendly-stationary-look-around"
        ? Phaser.Math.Between(behavior.lookMinMs, behavior.lookMaxMs)
        : 0,
    health: healthValue,
    maxHealth: healthValue,
    healthBarBg,
    healthBarFill,
    isFrozen: false,
    frozenPosition: null,
    moveSpeed: moveSpeedValue,
    pointsOnKill: 10,
    scale: 1,
    isEnemy,
  };
}

export function updateNpcMovement(
  npc: NpcState,
  delta: number,
  map: number[][],
  worldWidth: number,
  worldHeight: number,
) {
  if (npc.behavior.kind === "friendly-stationary-fixed") {
    if (npc.facing !== npc.behavior.facing) {
      npc.facing = npc.behavior.facing;
    }
    return;
  }

  if (npc.behavior.kind === "friendly-stationary-look-around") {
    npc.lookAroundTimer -= delta;
    if (npc.lookAroundTimer <= 0) {
      const options = LOOK_AROUND_DIRECTIONS.filter(
        (direction) => direction !== npc.facing,
      );
      const nextFacing =
        options[Phaser.Math.Between(0, options.length - 1)] ?? npc.facing;
      npc.facing = nextFacing;
      npc.lookAroundTimer = Phaser.Math.Between(
        npc.behavior.lookMinMs,
        npc.behavior.lookMaxMs,
      );
    }
    return;
  }

  const decisionMinMs =
    npc.behavior.kind === "friendly-wander"
      ? npc.behavior.decisionMinMs
      : NPC_DIRECTION_MIN_MS;
  const decisionMaxMs =
    npc.behavior.kind === "friendly-wander"
      ? npc.behavior.decisionMaxMs
      : NPC_DIRECTION_MAX_MS;
  const speedMultiplier =
    npc.behavior.kind === "friendly-wander" ? npc.behavior.speedMultiplier : 1;

  npc.decisionTimer -= delta;
  if (npc.decisionTimer <= 0) {
    npc.direction = randomDirection();
    npc.decisionTimer = Phaser.Math.Between(decisionMinMs, decisionMaxMs);
  }

  if (npc.direction.x === 0 && npc.direction.y === 0) {
    return;
  }

  const length = Math.hypot(npc.direction.x, npc.direction.y);
  const norm = {
    x: npc.direction.x / length,
    y: npc.direction.y / length,
  };

  const distance = (NPC_SPEED * speedMultiplier * delta) / 1000;
  const moved = tryMoveEntity(
    npc.gridPos,
    norm,
    distance,
    map,
    worldWidth,
    worldHeight,
  );

  if (!moved) {
    npc.direction = randomDirection();
    npc.decisionTimer = Phaser.Math.Between(decisionMinMs, decisionMaxMs);
    return;
  }

  npc.facing = directionFromVector(projectIsoDirectionToScreen(norm));
}

export function updateEnemyNpcMovement(
  npc: NpcState,
  playerPos: Vec2,
  delta: number,
  collisionMap: number[][],
  worldWidth: number,
  worldHeight: number,
  otherEnemies: NpcState[] = [],
) {
  if (npc.isFrozen) {
    return;
  }

  const distToPlayer = Math.hypot(
    playerPos.x - npc.gridPos.x,
    playerPos.y - npc.gridPos.y,
  );

  if (distToPlayer <= ENEMY_CATCH_DISTANCE) {
    console.log("[ENEMY DEBUG] Player caught! Freezing NPC at:", npc.gridPos);
    npc.isFrozen = true;
    npc.frozenPosition = { x: npc.gridPos.x, y: npc.gridPos.y };
    return;
  }

  const toPlayer = {
    x: playerPos.x - npc.gridPos.x,
    y: playerPos.y - npc.gridPos.y,
  };

  const dist = Math.hypot(toPlayer.x, toPlayer.y);

  if (dist < 0.1) {
    return;
  }

  const norm = {
    x: toPlayer.x / dist,
    y: toPlayer.y / dist,
  };

  // Aplicar steering de separação para evitar empilhamento
  let separationX = 0;
  let separationY = 0;
  
  for (const other of otherEnemies) {
    if (other.id === npc.id || other.health <= 0) continue;
    
    const dx = npc.gridPos.x - other.gridPos.x;
    const dy = npc.gridPos.y - other.gridPos.y;
    const distToOther = Math.hypot(dx, dy);
    
    if (distToOther < ENEMY_SEPARATION_DISTANCE && distToOther > 0.01) {
      // Força de repulsão inversamente proporcional à distância
      const force = ENEMY_SEPARATION_FORCE * (1 - distToOther / ENEMY_SEPARATION_DISTANCE);
      separationX += (dx / distToOther) * force;
      separationY += (dy / distToOther) * force;
    }
  }
  
  // Combinar direção ao player com separação
  const finalDirX = norm.x + separationX;
  const finalDirY = norm.y + separationY;
  const finalDist = Math.hypot(finalDirX, finalDirY);
  
  const finalNorm = finalDist > 0.01 ? {
    x: finalDirX / finalDist,
    y: finalDirY / finalDist,
  } : norm;

  const distance = (npc.moveSpeed * delta) / 1000;
  const nextX = npc.gridPos.x + finalNorm.x * distance;
  const nextY = npc.gridPos.y + finalNorm.y * distance;

  const tileX = Math.round(nextX);
  const tileY = Math.round(nextY);

  const isBlocked =
    tileX < 0 ||
    tileY < 0 ||
    tileX >= worldWidth ||
    tileY >= worldHeight ||
    collisionMap[tileY]?.[tileX] !== 0;

  if (!isBlocked) {
    npc.gridPos.x = nextX;
    npc.gridPos.y = nextY;
    npc.facing = directionFromVector(projectIsoDirectionToScreen(finalNorm));
  } else {
    const canMoveX = collisionMap[Math.round(npc.gridPos.y)]?.[tileX] === 0;
    const canMoveY = collisionMap[tileY]?.[Math.round(npc.gridPos.x)] === 0;

    if (canMoveX) {
      npc.gridPos.x = nextX;
      npc.facing = directionFromVector(
        projectIsoDirectionToScreen({ x: finalNorm.x, y: 0 }),
      );
    } else if (canMoveY) {
      npc.gridPos.y = nextY;
      npc.facing = directionFromVector(
        projectIsoDirectionToScreen({ x: 0, y: finalNorm.y }),
      );
    }
  }
}

export function syncNpcSprite(
  npc: NpcState,
  isoToWorld: IsoToWorld,
  showHealthBar: boolean,
) {
  const world = isoToWorld(npc.gridPos.x, npc.gridPos.y);
  npc.sprite.setPosition(world.x, world.y + NPC_FEET_OFFSET_Y);
  npc.sprite.setDepth(world.y + 9);

  const textureKey = DIRECTION_TO_FRAME[npc.facing] ?? "penguin-south";
  npc.sprite.setTexture(textureKey);

  const barWorldY = world.y + HEALTH_BAR_OFFSET_Y;
  npc.healthBarBg.setPosition(world.x, barWorldY);
  npc.healthBarBg.setDepth(world.y + 10);
  npc.healthBarFill.setPosition(world.x, barWorldY);
  npc.healthBarFill.setDepth(world.y + 11);

  npc.healthBarBg.setVisible(showHealthBar);
  npc.healthBarFill.setVisible(showHealthBar);

  if (showHealthBar) {
    const healthPercent = Math.max(0, npc.health / npc.maxHealth);
    const fillWidth = HEALTH_BAR_WIDTH * healthPercent;
    npc.healthBarFill.setSize(fillWidth, HEALTH_BAR_HEIGHT);
    npc.healthBarFill.setX(world.x - HEALTH_BAR_WIDTH / 2 + fillWidth / 2);
  }
}

export function damageEnemy(npc: NpcState, damage: number) {
  npc.health = Math.max(0, npc.health - damage);
}

/**
 * Spawna uma wave/horda de inimigos em runtime
 * @param scene - Cena do Phaser
 * @param positions - Array de posições onde spawnar os inimigos
 * @param isoToWorld - Função de conversão isométrica
 * @param behavior - Comportamento dos inimigos (pode customizar HP e velocidade)
 * @param waveId - ID opcional para identificar a wave (usado para gerar IDs únicos)
 * @returns Array de NpcState spawnados
 */
export function spawnEnemyWave(
  scene: Phaser.Scene,
  positions: Vec2[],
  isoToWorld: IsoToWorld,
  behavior: EnemyNpcBehavior = {
    kind: "enemy-chase",
    speedMultiplier: 1,
  },
  waveId?: string,
): NpcState[] {
  const enemies: NpcState[] = [];
  const wavePrefix = waveId ?? `wave-${Date.now()}`;

  for (let i = 0; i < positions.length; i++) {
    const enemy = spawnNpc(
      scene,
      positions[i],
      isoToWorld,
      true, // isEnemy
      behavior,
      `${wavePrefix}-${i}`, // ID único por inimigo na wave
    );
    enemies.push(enemy);
  }

  return enemies;
}
