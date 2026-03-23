import type { Weapon, WeaponContext } from './types';

export class WeaponManager {
	private weapons: Map<string, Weapon> = new Map();

	addWeapon(weapon: Weapon): void {
		if (this.weapons.has(weapon.id)) {
			return;
		}
		this.weapons.set(weapon.id, weapon);
	}

	removeWeapon(id: string): void {
		const weapon = this.weapons.get(id);
		if (weapon) {
			weapon.destroy();
			this.weapons.delete(id);
		}
	}

	hasWeapon(id: string): boolean {
		return this.weapons.has(id);
	}

	getWeapon(id: string): Weapon | undefined {
		return this.weapons.get(id);
	}

	update(delta: number, ctx: WeaponContext): void {
		for (const weapon of this.weapons.values()) {
			weapon.update(delta, ctx);
		}
	}

	destroy(): void {
		for (const weapon of this.weapons.values()) {
			weapon.destroy();
		}
		this.weapons.clear();
	}
}
