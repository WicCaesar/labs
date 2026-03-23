import Phaser from 'phaser';
import { SCENE_KEYS } from '../../shared/constants/sceneKeys';

interface ScoreEntry {
	name: string;
	score: number;
}

export class RankScreen extends Phaser.Scene {
	private scores: ScoreEntry[] = [];

	constructor() {
		super(SCENE_KEYS.RANK_SCREEN);
	}

	create() {
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;

		this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1a1a).setOrigin(0);

		const titleText = this.add.text(centerX, 80, 'RANKING', {
			fontSize: '48px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		titleText.setOrigin(0.5);

		this.loadScores();
		this.displayScores(centerX, centerY);

		this.createButton(centerX, this.scale.height - 80, 'VOLTAR', 0x505050, 0x707070, () => {
			this.scene.start(SCENE_KEYS.MAIN_SCREEN);
		});
	}

	private loadScores() {
		const stored = localStorage.getItem('dungeonScores');
		if (stored) {
			try {
				this.scores = JSON.parse(stored);
			} catch {
				this.scores = [];
			}
		}
	}

	private displayScores(centerX: number, centerY: number) {
		const startY = centerY - 60;

		if (this.scores.length === 0) {
			const emptyText = this.add.text(centerX, centerY, 'Nenhum registro ainda', {
				fontSize: '24px',
				color: '#606060',
				fontFamily: 'Arial, sans-serif'
			});
			emptyText.setOrigin(0.5);
			return;
		}

		const sortedScores = [...this.scores].sort((a, b) => b.score - a.score);

		const headerY = startY - 30;
		this.add.text(centerX - 100, headerY, 'POS', { fontSize: '18px', color: '#808080', fontFamily: 'Arial' }).setOrigin(0.5);
		this.add.text(centerX + 0, headerY, 'PONTUAÇÃO', { fontSize: '18px', color: '#808080', fontFamily: 'Arial' }).setOrigin(0.5);

		sortedScores.slice(0, 10).forEach((entry, index) => {
			const y = startY + index * 40;
			const posColor = index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#e0e0e0';

			this.add.text(centerX - 100, y, `#${index + 1}`, {
				fontSize: '22px',
				color: posColor,
				fontFamily: 'Arial',
				fontStyle: 'bold'
			}).setOrigin(0.5);

			this.add.text(centerX + 0, y, `${entry.score} pts`, {
				fontSize: '22px',
				color: '#e0e0e0',
				fontFamily: 'Arial'
			}).setOrigin(0.5);
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
		const buttonWidth = 160;
		const buttonHeight = 45;

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
			fontSize: '18px',
			color: '#e0e0e0',
			fontFamily: 'Arial, sans-serif',
			fontStyle: 'bold'
		});
		buttonText.setOrigin(0.5);

		container.add([bg, buttonText]);

		return container;
	}

	static saveScore(score: number) {
		const stored = localStorage.getItem('dungeonScores');
		let scores: ScoreEntry[] = [];
		if (stored) {
			try {
				scores = JSON.parse(stored);
			} catch {
				scores = [];
			}
		}
		scores.push({ name: `Jogador ${scores.length + 1}`, score });
		localStorage.setItem('dungeonScores', JSON.stringify(scores));
	}
}
