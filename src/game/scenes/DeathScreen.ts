import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';
import { RankScreen } from './RankScreen';

export class DeathScreen extends Phaser.Scene {
	private score = 0;

	constructor() {
		super(SCENE_KEYS.DEATH_SCREEN);
	}

	init(data: { score: number }) {
		this.score = data.score || 0;
	}

	create() {
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;

		this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a0a0a).setOrigin(0);

		const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7).setOrigin(0);
		overlay.setInteractive();

		const gameOverText = this.add.text(centerX, centerY - 120, 'VOCÊ MORREU', {
			fontSize: '56px',
			color: '#cc0000',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		gameOverText.setOrigin(0.5);

		const scoreText = this.add.text(centerX, centerY - 40, `PONTUAÇÃO: ${this.score}`, {
			fontSize: '32px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif'
		});
		scoreText.setOrigin(0.5);

		if (this.score > 0) {
			RankScreen.saveScore(this.score);
			const savedText = this.add.text(centerX, centerY + 10, 'Pontuação salva!', {
				fontSize: '18px',
				color: '#808080',
				fontFamily: 'Arial, sans-serif'
			});
			savedText.setOrigin(0.5);
		}

		this.createButton(centerX, centerY + 80, 'MENU', 0x404040, 0x606060, () => {
			this.scene.start(SCENE_KEYS.MAIN_SCREEN);
		});
	}

	private createButton(
		x: number,
		y: number,
		text: string,
		color: number,
		hoverColor: number,
		onClick: () => void
	): Phaser.GameObjects.Container {
		const buttonWidth = 180;
		const buttonHeight = 50;

		const container = this.add.container(x, y);

		const bg = this.add.rectangle(0, 0, buttonWidth, buttonHeight, color);
		bg.setOrigin(0.5);
		bg.setStrokeStyle(1, 0x808080);
		bg.setInteractive({ useHandCursor: true });

		bg.on('pointerover', () => {
			bg.setFillStyle(hoverColor);
			bg.setScale(1.05);
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
