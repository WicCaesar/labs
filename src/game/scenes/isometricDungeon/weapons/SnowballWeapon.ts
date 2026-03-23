import Phaser from "phaser";
import type { Weapon, WeaponContext } from "./types";
import type { NpcState } from "../npc";
import { findNearestEnemy, isEnemyInRange } from "../combatSystem";
import { damageEnemy } from "../npc";

// Constantes
const SNOWBALL_COLOR = 0xffffff;
const SNOWBALL_RADIUS = 6;

interface SnowballProjectile {
  graphics: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  duration: number;
  damage: number;
  active: boolean;
  targetNpc: NpcState | null;
}

export class SnowballWeapon implements Weapon {
  readonly id = "snowball";
  readonly name = "Bola de Neve";
  level = 1;

  private cooldownMs = 800;
  private currentCooldown = 0;
  private range = 7;
  private damage = 1;
  private speed = 1;
  private projectiles: SnowballProjectile[] = [];

  update(delta: number, ctx: WeaponContext): void {
    this.currentCooldown -= delta;

    // Tentar disparar apenas se há inimigos vivos
    if (this.currentCooldown <= 0 && ctx.enemies.length > 0) {
      const aliveEnemies = ctx.enemies.filter((e) => e.health > 0);
      const nearestEnemy = findNearestEnemy(aliveEnemies, ctx.playerGridPos);

      if (
        nearestEnemy &&
        isEnemyInRange(ctx.playerGridPos, nearestEnemy, this.range)
      ) {
        this.fire(ctx, nearestEnemy);
        this.currentCooldown = this.cooldownMs;
      }
    }

    // Sempre atualizar projéteis existentes, mesmo sem inimigos
    this.updateProjectiles(delta, ctx);
  }

  private fire(ctx: WeaponContext, target: NpcState): void {
    const enemyWorld = ctx.isoToWorld(target.gridPos.x, target.gridPos.y);
    const dx = enemyWorld.x - ctx.playerWorldPos.x;
    const dy = enemyWorld.y - ctx.playerWorldPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) {
      return;
    }

    const targetX = ctx.playerWorldPos.x + (dx / dist) * this.range * 64;
    const targetY = ctx.playerWorldPos.y + (dy / dist) * this.range * 32;

    const graphics = ctx.scene.add.graphics();
    graphics.fillStyle(SNOWBALL_COLOR, 1);
    graphics.fillCircle(0, 0, SNOWBALL_RADIUS);
    graphics.setDepth(100);
    graphics.setPosition(ctx.playerWorldPos.x, ctx.playerWorldPos.y);

    this.projectiles.push({
      graphics,
      x: ctx.playerWorldPos.x,
      y: ctx.playerWorldPos.y,
      targetX,
      targetY,
      progress: 0,
      duration: this.speed * 1000,
      damage: this.damage,
      active: true,
      targetNpc: target,
    });
  }

  private updateProjectiles(delta: number, ctx: WeaponContext): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (!p.active) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Mover projétil
      p.progress += delta / p.duration;
      if (p.progress >= 1) {
        p.active = false;
        p.graphics.destroy();
        continue;
      }

      const t = p.progress;
      p.x = Phaser.Math.Linear(p.x, p.targetX, t * 0.1);
      p.y = Phaser.Math.Linear(p.y, p.targetY, t * 0.1);
      p.graphics.setPosition(p.x, p.y);

      // Checar colisão
      if (p.targetNpc && p.targetNpc.health > 0) {
        const enemyWorld = ctx.isoToWorld(
          p.targetNpc.gridPos.x,
          p.targetNpc.gridPos.y,
        );
        const dx = p.x - enemyWorld.x;
        const dy = p.y - enemyWorld.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 20) {
          damageEnemy(p.targetNpc, p.damage);
          p.active = false;
          p.graphics.destroy();

          if (p.targetNpc.health <= 0) {
            ctx.onEnemyKilled(p.targetNpc);
          }
        }
      }
    }
  }

  destroy(): void {
    for (const p of this.projectiles) {
      if (p.graphics) {
        p.graphics.destroy();
      }
    }
    this.projectiles = [];
  }
}
