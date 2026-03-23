import React, { useEffect, useState } from 'react';
import { EventBus } from '../../shared/events/EventBus';
import type { DungeonLevelId } from '../../game/scenes/isometricDungeon/levelConfig';
import styles from './ThemeTextDrawer.module.css';

interface CollectibleKeyword {
	id: string;
	originalCase: string;
}

interface ThemeState {
	levelId: DungeonLevelId;
	themeTitle: string;
	fullText: string;
	keywords: CollectibleKeyword[];
	collectedKeywords: Map<number, string>;
	collectedCount: number;
	totalCount: number;
}

/**
 * ThemeTextDrawer - Right-side drawer component showing theme narrative.
 * Displays the full text with collectible keyword placeholders that fill in
 * as player collects items in the dungeon.
 */
export const ThemeTextDrawer: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [theme, setTheme] = useState<ThemeState | null>(null);

	const toParagraphs = (rawText: string) => {
		// Keep paragraph breaks (double line breaks), but normalize single line wraps.
		return rawText
			.split(/\n\s*\n/g)
			.map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
			.filter(Boolean);
	};

	useEffect(() => {
		const unsubscribeSpawned = EventBus.on('dungeon:collectibles-spawned', (detail) => {
			setTheme({
				levelId: detail.levelId,
				themeTitle: detail.themeTitle,
				fullText: detail.fullText,
				keywords: detail.keywords,
				collectedKeywords: new Map(),
				collectedCount: 0,
				totalCount: detail.keywords.length
			});
			// Auto-open drawer when collectibles are spawned
			setIsOpen(true);
		});

		const unsubscribePickedUp = EventBus.on('dungeon:collectible-picked-up', (detail) => {
			setTheme((prevTheme) => {
				if (!prevTheme) return prevTheme;

				const newCollected = new Map(prevTheme.collectedKeywords);
				newCollected.set(detail.keywordIndex, detail.originalCase);

				return {
					...prevTheme,
					collectedKeywords: newCollected,
					collectedCount: detail.collectedCount,
					totalCount: detail.totalCount
				};
			});
		});

		const unsubscribeCleared = EventBus.on('dungeon:collectibles-cleared', () => {
			setTheme(null);
			setIsOpen(false);
		});

		return () => {
			unsubscribeSpawned();
			unsubscribePickedUp();
			unsubscribeCleared();
		};
	}, []);

	if (!theme) {
		return null;
	}

	// Build the display text by replacing placeholders with collected keywords
	const renderThemeParagraphs = () => {
		// Match placeholder patterns like [placeholder_0], [placeholder_1], etc.
		// and replace with collected keywords or empty boxes
		let result = theme.fullText;

		// Replace the placeholder markers in the fullText
		theme.keywords.forEach((keyword, index) => {
			const placeholderPattern = `[${keyword.originalCase}]`;

			if (theme.collectedKeywords.has(index)) {
				// Replace with collected keyword
				const collectedWord = theme.collectedKeywords.get(index);
				if (collectedWord) {
					result = result.replace(placeholderPattern, collectedWord);
				}
			} else {
				// Replace with empty placeholder box
				result = result.replace(placeholderPattern, '[_____]');
			}
		});

		return toParagraphs(result);
	};

	const paragraphs = renderThemeParagraphs();

	return (
		<div className={`${styles.drawer} ${isOpen ? styles.open : ''}`}>
			<div className={styles.header}>
				<h3 className={styles.title}>{theme.themeTitle}</h3>
				<button
					className={styles.closeButton}
					onClick={() => setIsOpen(false)}
					aria-label="Close drawer"
				>
					✕
				</button>
			</div>

			<div className={styles.progressBar}>
				<div
					className={styles.progressFill}
					style={{
						width: `${(theme.collectedCount / theme.totalCount) * 100}%`
					}}
				/>
				<span className={styles.progressText}>
					{theme.collectedCount} of {theme.totalCount} keywords
				</span>
			</div>

			<div className={styles.content}>
				{paragraphs.map((paragraph, index) => (
					<p key={`${theme.levelId}-paragraph-${index}`} className={styles.themeText} lang="pt-BR">
						{paragraph}
					</p>
				))}
			</div>

			<button
				className={styles.toggleButton}
				onClick={() => setIsOpen(!isOpen)}
				aria-label={isOpen ? 'Close theme drawer' : 'Open theme drawer'}
			>
				{isOpen ? '›' : '‹'}
			</button>
		</div>
	);
};
