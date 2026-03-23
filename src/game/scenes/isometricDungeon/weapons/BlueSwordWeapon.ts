import Phaser from "phaser";
import type { Weapon, WeaponContext } from "./types";
import type { NpcState } from "../npc";
import type { DirectionKey } from "../types";
import { damageEnemy } from "../npc";

// Constantes
const SWORD_COLOR = 0x4a9eff; // Azul vibrante
const SWORD_DAMAGE = 5;
const SWORD_COOLDOWN_MS = 800;
const SWORD_REACH = 3; // Distância do slash em tiles
const SWORD_ARC_ANGLE = 120; // Ângulo do arco em graus
const SLASH_DURATION_MS = 200; // Duração visual do slash

// Mapeamento de direções para ângulos (em graus)
const DIRECTION_TO_ANGLE: Record<DirectionKey, number> = {
  north: -90,
  "north-east": -45,
  east: 0,
  "south-east": 45,
  south: 90,
  "south-west": 135,
  west: 180,
  "north-west": -135,
};

interface SlashEffect {
  graphics: Phaser.GameObjects.Graphics;
  hitEnemies: Set<NpcState>;
  duration: number;
  elapsed: number;
}

export class BlueSwordWeapon implements Weapon {
  readonly id = "blue-sword";
  readonly name = "Espada Azul";
  level = 1;

  private cooldownMs = SWORD_COOLDOWN_MS;
  private currentCooldown = 0;
  private reach = SWORD_REACH;
  private damage = SWORD_DAMAGE;
  private activeSlash: SlashEffect | null = null;

	update(delta: number, ctx: WeaponContext): void {
		this.currentCooldown -= delta;

		// Sempre atualizar slash ativo PRIMEIRO, mesmo sem inimigos
		if (this.activeSlash) {
			this.activeSlash.elapsed += delta;

			// Checar colisões durante a duração do slash (somente se há inimigos)
			if (this.activeSlash.elapsed < this.activeSlash.duration && ctx.enemies.length > 0) {
				this.checkSlashHits(ctx);
			}

			// Destruir slash após duração
			if (this.activeSlash.elapsed >= this.activeSlash.duration) {
				this.destroyActiveSlash();
			}
		}

		// Tentar ativar slash apenas se há inimigos vivos
		if (this.currentCooldown <= 0 && ctx.enemies.length > 0 && ctx.enemies.some((e) => e.health > 0)) {
			this.performSlash(ctx);
			this.currentCooldown = this.cooldownMs;
		}
	}

	private destroyActiveSlash(): void {
		if (this.activeSlash) {
			if (this.activeSlash.graphics && this.activeSlash.graphics.scene) {
				this.activeSlash.graphics.destroy();
			}
			this.activeSlash = null;
		}
	}

	private performSlash(ctx: WeaponContext): void {
		// Destruir slash anterior se ainda existir (failsafe)
		this.destroyActiveSlash();

		const angle = DIRECTION_TO_ANGLE[ctx.playerFacing];
		const angleRad = Phaser.Math.DegToRad(angle);

    // Criar visual do slash (arco)
    const graphics = ctx.scene.add.graphics();
    graphics.lineStyle(8, SWORD_COLOR, 1);
    graphics.fillStyle(SWORD_COLOR, 0.3);

    const startAngle = angleRad - Phaser.Math.DegToRad(SWORD_ARC_ANGLE / 2);
    const endAngle = angleRad + Phaser.Math.DegToRad(SWORD_ARC_ANGLE / 2);
    const radius = this.reach * 32; // Converter tiles para pixels (aproximado)

    // Desenhar arco
    graphics.beginPath();
    graphics.arc(
      ctx.playerWorldPos.x,
      ctx.playerWorldPos.y,
      radius,
      startAngle,
      endAngle,
      false,
    );
    graphics.strokePath();

    // Desenhar preenchimento do arco
    graphics.beginPath();
    graphics.moveTo(ctx.playerWorldPos.x, ctx.playerWorldPos.y);
    graphics.arc(
      ctx.playerWorldPos.x,
      ctx.playerWorldPos.y,
      radius,
      startAngle,
      endAngle,
      false,
    );
    graphics.lineTo(ctx.playerWorldPos.x, ctx.playerWorldPos.y);
    graphics.closePath();
    graphics.fillPath();

    graphics.setDepth(ctx.playerWorldPos.y + 5);

    this.activeSlash = {
      graphics,
      hitEnemies: new Set(),
      duration: SLASH_DURATION_MS,
      elapsed: 0,
    };
  }

  private checkSlashHits(ctx: WeaponContext): void {
    if (!this.activeSlash) return;

    const angle = DIRECTION_TO_ANGLE[ctx.playerFacing];
    const angleRad = Phaser.Math.DegToRad(angle);

    for (const enemy of ctx.enemies) {
      if (enemy.health <= 0) continue;
      if (this.activeSlash.hitEnemies.has(enemy)) continue;

      // Calcular distância e ângulo até o inimigo
      const dx = enemy.gridPos.x - ctx.playerGridPos.x;
      const dy = enemy.gridPos.y - ctx.playerGridPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Checar se está dentro do alcance
      if (distance > this.reach) continue;

      // Calcular ângulo até o inimigo (em coordenadas isométricas)
      // Converter para coordenadas de tela para comparar com a direção do player
      const enemyAngle = Math.atan2(dy, dx);
      const angleDiff = this.normalizeAngle(enemyAngle - angleRad);

      // Checar se está dentro do arco
      const halfArc = Phaser.Math.DegToRad(SWORD_ARC_ANGLE / 2);
      if (Math.abs(angleDiff) <= halfArc) {
        // Acertou!
        damageEnemy(enemy, this.damage);
        this.activeSlash.hitEnemies.add(enemy);
        ctx.onEnemyDamaged(enemy);

        if (enemy.health <= 0) {
          ctx.onEnemyKilled(enemy);
        }
      }
    }
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

	destroy(): void {
		this.destroyActiveSlash();
	}
}
