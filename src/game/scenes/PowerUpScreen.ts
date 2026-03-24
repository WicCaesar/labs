import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';

const STORAGE_KEY = 'dungeonUpgrades';
const BALANCE_KEY = 'dungeonBalance';

interface UpgradeData {
	snowballCooldownLevel: number;
	snowballDamageLevel: number;
	blueSwordCooldownLevel: number;
	blueSwordDamageLevel: number;
	blueSwordUnlocked: boolean;
}

const MAX_LEVEL = 5;

const DEFAULT_UPGRADES: UpgradeData = {
	snowballCooldownLevel: 1,
	snowballDamageLevel: 1,
	blueSwordCooldownLevel: 1,
	blueSwordDamageLevel: 1,
	blueSwordUnlocked: false,
};

export function getUpgrades(): UpgradeData {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return { ...DEFAULT_UPGRADES, ...JSON.parse(stored) };
		}
	} catch {
		// ignore
	}
	return { ...DEFAULT_UPGRADES };
}

export function saveUpgrades(upgrades: UpgradeData): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(upgrades));
}

export function getBalance(): number {
	try {
		const stored = localStorage.getItem(BALANCE_KEY);
		if (stored) {
			return parseInt(stored, 10);
		}
	} catch {
		// ignore
	}
	return 0;
}

export function deductBalance(amount: number): boolean {
	const current = getBalance();
	if (current < amount) {
		return false;
	}
	localStorage.setItem(BALANCE_KEY, String(current - amount));
	return true;
}

export function addBalance(amount: number): void {
	const current = getBalance();
	localStorage.setItem(BALANCE_KEY, String(current + amount));
}

export function getSnowballCooldown(level: number): number {
	const cooldowns = [2000, 1000, 500, 500, 500];
	return cooldowns[level - 1] ?? 500;
}

export function getSnowballDamage(level: number): number {
	const damages = [1, 3, 5, 5, 5];
	return damages[level - 1] ?? 5;
}

export function getBlueSwordCooldown(_level: number): number {
	return 800;
}

export function getBlueSwordDamage(level: number): number {
	const damages = [5, 7, 10, 10, 10];
	return damages[level - 1] ?? 10;
}

export function getBlueSwordArcAngle(level: number): number {
	const angles = [80, 90, 100, 100, 100];
	return angles[level - 1] ?? 100;
}

export class PowerUpScreen extends Phaser.Scene {
	private upgrades: UpgradeData = getUpgrades();

	constructor() {
		super(SCENE_KEYS.POWERUP_SCREEN);
	}

	create() {
		this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1a1a).setOrigin(0);

		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;

		const titleText = this.add.text(centerX, 50, 'MELHORIAS', {
			fontSize: '48px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		titleText.setOrigin(0.5);

		const balance = getBalance();
		const balanceText = this.add.text(centerX, 100, `PONTOS: ${balance}`, {
			fontSize: '24px',
			color: '#FFD700',
			fontFamily: 'Arial, sans-serif'
		});
		balanceText.setOrigin(0.5);

		this.createButton(80, 40, 'VOLTAR', 0x505050, 0x707070, () => {
			this.scene.start(SCENE_KEYS.MAIN_SCREEN);
		});

		this.createSnowballUpgrades(centerX, centerY - 80);
		this.createBlueSwordUpgrades(centerX, centerY + 140);

		const resetText = this.add.text(centerX, this.scale.height - 30, 'Resetar melhorias', {
			fontSize: '14px',
			color: '#505050',
			fontFamily: 'Arial, sans-serif'
		});
		resetText.setOrigin(0.5);
		resetText.setInteractive({ useHandCursor: true });
		resetText.on('pointerover', () => resetText.setColor('#808080'));
		resetText.on('pointerout', () => resetText.setColor('#505050'));
		resetText.on('pointerdown', () => {
			this.upgrades = { ...DEFAULT_UPGRADES };
			saveUpgrades(this.upgrades);
			this.scene.restart();
		});
	}

	private createSnowballUpgrades(centerX: number, baseY: number) {
		const weaponTitle = this.add.text(centerX, baseY - 50, 'BOLA DE NEVE', {
			fontSize: '28px',
			color: '#87CEEB',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		weaponTitle.setOrigin(0.5);

		this.createUpgradeRow(
			centerX,
			baseY,
			'Cooldown',
			this.upgrades.snowballCooldownLevel,
			'snowballCooldownLevel',
			() => getSnowballCooldown(this.upgrades.snowballCooldownLevel),
			() => getSnowballCooldown(this.upgrades.snowballCooldownLevel + 1)
		);

		this.createUpgradeRow(
			centerX,
			baseY + 70,
			'Dano',
			this.upgrades.snowballDamageLevel,
			'snowballDamageLevel',
			() => getSnowballDamage(this.upgrades.snowballDamageLevel),
			() => getSnowballDamage(this.upgrades.snowballDamageLevel + 1)
		);
	}

	private createBlueSwordUpgrades(centerX: number, baseY: number) {
		const isUnlocked = this.upgrades.blueSwordUnlocked;

		if (!isUnlocked) {
			const lockedText = this.add.text(centerX, baseY, '???', {
				fontSize: '32px',
				color: '#404040',
				fontFamily: 'Arial, sans-serif',
				fontStyle: 'bold'
			});
			lockedText.setOrigin(0.5);

			const hintText = this.add.text(centerX, baseY + 40, 'Desbloqueie a Espada Azul\nmatando o Chefão da 3ª Horda', {
				fontSize: '16px',
				color: '#505050',
				fontFamily: 'Arial, sans-serif',
				align: 'center'
			});
			hintText.setOrigin(0.5);
			return;
		}

		const weaponTitle = this.add.text(centerX, baseY - 50, 'ESPADA AZUL', {
			fontSize: '28px',
			color: '#4a9eff',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		weaponTitle.setOrigin(0.5);

		this.createUpgradeRow(
			centerX,
			baseY,
			'Cooldown',
			this.upgrades.blueSwordCooldownLevel,
			'blueSwordCooldownLevel',
			() => getBlueSwordCooldown(this.upgrades.blueSwordCooldownLevel),
			() => getBlueSwordCooldown(this.upgrades.blueSwordCooldownLevel + 1)
		);

		this.createUpgradeRow(
			centerX,
			baseY + 70,
			'Dano',
			this.upgrades.blueSwordDamageLevel,
			'blueSwordDamageLevel',
			() => getBlueSwordDamage(this.upgrades.blueSwordDamageLevel),
			() => getBlueSwordDamage(this.upgrades.blueSwordDamageLevel + 1)
		);
	}

	private createUpgradeRow(
		x: number,
		y: number,
		label: string,
		level: number,
		key: keyof UpgradeData,
		currentValue: () => number,
		nextValue: () => number
	) {
		const labelText = this.add.text(x - 150, y, label + ':', {
			fontSize: '20px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif'
		});
		labelText.setOrigin(0, 0.5);

		const levelText = this.add.text(x - 50, y, `Nvl ${level}/${MAX_LEVEL}`, {
			fontSize: '18px',
			color: '#808080',
			fontFamily: 'Arial, sans-serif'
		});
		levelText.setOrigin(0, 0.5);

		const currentVal = currentValue();
		const valueText = this.add.text(x + 30, y, `${currentVal}`, {
			fontSize: '18px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif'
		});
		valueText.setOrigin(0, 0.5);

		if (level < MAX_LEVEL) {
			const nextVal = nextValue();
			const cost = this.getUpgradeCost(key as keyof UpgradeData, level);
			const upgradeText = this.add.text(x + 100, y, `→ ${nextVal}`, {
				fontSize: '18px',
				color: '#50C878',
				fontFamily: 'Arial, sans-serif'
			});
			upgradeText.setOrigin(0, 0.5);

			const costText = this.add.text(x + 100, y + 20, `${cost} pts`, {
				fontSize: '14px',
				color: '#808080',
				fontFamily: 'Arial, sans-serif'
			});
			costText.setOrigin(0, 0.5);

			this.createSmallButton(x + 200, y, 'UP', () => {
				if (deductBalance(cost)) {
					(this.upgrades[key] as number)++;
					saveUpgrades(this.upgrades);
					this.scene.restart();
				}
			});
		} else {
			const maxText = this.add.text(x + 100, y, '(MAX)', {
				fontSize: '16px',
				color: '#50C878',
				fontFamily: 'Arial, sans-serif'
			});
			maxText.setOrigin(0, 0.5);
		}
	}

	private getUpgradeCost(key: keyof UpgradeData, currentLevel: number): number {
		const costs: Record<string, number[]> = {
			snowballCooldownLevel: [100, 200, 400, 800, 1600],
			snowballDamageLevel: [100, 200, 400, 800, 1600],
			blueSwordCooldownLevel: [200, 400, 800, 1600, 3200],
			blueSwordDamageLevel: [200, 400, 800, 1600, 3200],
		};
		const keyStr = key as string;
		return costs[keyStr]?.[currentLevel - 1] ?? 100;
	}

	private createButton(
		x: number,
		y: number,
		text: string,
		color: number,
		hoverColor: number,
		onClick: () => void
	): Phaser.GameObjects.Container {
		const buttonWidth = 120;
		const buttonHeight = 40;

		const container = this.add.container(x, y);

		const bg = this.add.rectangle(0, 0, buttonWidth, buttonHeight, color);
		bg.setOrigin(0.5);
		bg.setStrokeStyle(1, 0x808080);
		bg.setInteractive({ useHandCursor: true });

		bg.on('pointerover', () => {
			bg.setFillStyle(hoverColor);
			bg.setScale(1.02);
		});

		bg.on('pointerout', () => {
			bg.setFillStyle(color);
			bg.setScale(1);
		});

		bg.on('pointerdown', () => {
			onClick();
		});

		const buttonText = this.add.text(0, 0, text, {
			fontSize: '16px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		buttonText.setOrigin(0.5);

		container.add([bg, buttonText]);

		return container;
	}

	private createSmallButton(
		x: number,
		y: number,
		text: string,
		onClick: () => void
	): Phaser.GameObjects.Container {
		const buttonWidth = 50;
		const buttonHeight = 30;

		const container = this.add.container(x, y);

		const bg = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x50C878);
		bg.setOrigin(0.5);
		bg.setStrokeStyle(1, 0x70B060);
		bg.setInteractive({ useHandCursor: true });

		bg.on('pointerover', () => {
			bg.setFillStyle(0x70C888);
			bg.setScale(1.05);
		});

		bg.on('pointerout', () => {
			bg.setFillStyle(0x50C878);
			bg.setScale(1);
		});

		bg.on('pointerdown', () => {
			onClick();
		});

		const buttonText = this.add.text(0, 0, text, {
			fontSize: '14px',
			color: '#1a1a1a',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		buttonText.setOrigin(0.5);

		container.add([bg, buttonText]);

		return container;
	}
}
