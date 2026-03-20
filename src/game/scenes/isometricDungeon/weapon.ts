export interface WeaponConfig {
	name: string;
	damage: number;
	speed: number;
	projectileCount: number;
	cooldownMs: number;
	range: number;
}

export const SNOWBALL_WEAPON: WeaponConfig = {
	name: 'bolinhas de neve',
	damage: 1,
	speed: 2,
	projectileCount: 1,
	cooldownMs: 500,
	range: 5
};

export const SNOWBALL_COLOR = 0xffffff;
export const SNOWBALL_RADIUS = 6;
export const SNOWBALL_ACTIVATION_DISTANCE = 3;
