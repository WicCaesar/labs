import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';
import { EventBus } from '../../shared/events/EventBus';

export class MainScreen extends Phaser.Scene {
	constructor() {
		super(SCENE_KEYS.MAIN_SCREEN);
	}

	create() {
		EventBus.emit('scene:main-screen-started', {});

		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;

		this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1a1a).setOrigin(0);

		const titleText = this.add.text(centerX, centerY - 120, 'MASMORRA', {
			fontSize: '64px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		titleText.setOrigin(0.5);

		const subtitleText = this.add.text(centerX, centerY - 50, 'DUNGEON', {
			fontSize: '24px',
			color: '#808080',
			fontFamily: 'Arial, sans-serif'
		});
		subtitleText.setOrigin(0.5);

		const divider = this.add.rectangle(centerX, centerY, 200, 2, 0x404040);
		divider.setOrigin(0.5);

		this.createButton(centerX, centerY + 40, 'JOGAR', 0x505050, 0x707070, () => {
			this.scene.start(SCENE_KEYS.ISOMETRIC_DUNGEON);
		});

		this.createButton(centerX, centerY + 120, 'RANKING', 0x404040, 0x606060, () => {
			this.scene.start(SCENE_KEYS.RANK_SCREEN);
		});

		const controlsText = this.add.text(centerX, this.scale.height - 60, 'WASD / Setas para mover  |  E para interagir', {
			fontSize: '16px',
			color: '#606060',
			fontFamily: 'Arial, sans-serif'
		});
		controlsText.setOrigin(0.5);
	}

	private createButton(
		x: number,
		y: number,
		text: string,
		color: number,
		hoverColor: number,
		onClick: () => void
	): Phaser.GameObjects.Container {
		const buttonWidth = 200;
		const buttonHeight = 50;

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
			fontSize: '22px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		buttonText.setOrigin(0.5);

		container.add([bg, buttonText]);

		return container;
	}
}
