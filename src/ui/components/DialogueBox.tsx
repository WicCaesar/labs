import React, { useState, useEffect } from 'react';
import styles from './DialogueBox.module.css';

// Timing constants for dialogue interaction
const TYPEWRITER_INTERVAL_MS = 30; // milliseconds between each character
const HINT_DELAY_MS = 5000; // milliseconds before spacebar hint appears

export interface DialogueBoxProps {
	npcName: string;
	dialogueLines: string[];
	portraitAsset?: string;
	onComplete?: () => void;
}

export const DialogueBox: React.FC<DialogueBoxProps> = ({
	npcName,
	dialogueLines,
	portraitAsset = 'real-penguin-placeholder',
	onComplete
}) => {
	const [currentLineIndex, setCurrentLineIndex] = useState(0);
	const [displayedText, setDisplayedText] = useState('');
	const [isFullyDisplayed, setIsFullyDisplayed] = useState(false);
	const [showHint, setShowHint] = useState(false);

	const currentLine = dialogueLines[currentLineIndex];
	const isLastLine = currentLineIndex === dialogueLines.length - 1;

	// Typewriter effect: progressively reveal text character by character
	useEffect(() => {
		if (displayedText.length < currentLine.length) {
			const timer = setTimeout(() => {
				setDisplayedText(currentLine.substring(0, displayedText.length + 1));
			}, TYPEWRITER_INTERVAL_MS);
			return () => clearTimeout(timer);
		} else {
			setIsFullyDisplayed(true);
		}
	}, [displayedText, currentLine]);

	// Reset display when line changes
	useEffect(() => {
		setDisplayedText('');
		setIsFullyDisplayed(false);
		setShowHint(false);
	}, [currentLineIndex]);

	// Show hint after 5 seconds of line being fully displayed
	// This gives players time to read before hinting them to progress
	useEffect(() => {
		if (!isFullyDisplayed) return;

		const hintTimer = setTimeout(() => {
			setShowHint(true);
		}, HINT_DELAY_MS);

		return () => clearTimeout(hintTimer);
	}, [isFullyDisplayed]);

	// Handle spacebar to advance dialogue
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.code === 'Space') {
				event.preventDefault();
				handleAdvanceLine();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isFullyDisplayed, isLastLine, currentLineIndex]);

	const handleAdvanceLine = () => {
		// If text is still being typed, show full line immediately on spacebar press
		// instead of advancing to the next line
		if (!isFullyDisplayed) {
			setDisplayedText(currentLine);
			setIsFullyDisplayed(true);
			return;
		}

		// Once text is fully displayed, spacebar moves to next line or completes dialogue
		if (isLastLine) {
			onComplete?.();
		} else {
			setCurrentLineIndex((prev) => prev + 1);
		}
	};

	return (
		<div className={styles.dialogueBoxContainer}>
			<div className={styles.dialogueBoxContent}>
				{/* Portrait Section */}
				<div className={styles.portraitContainer}>
					<div className={styles.portraitCircle}>
						<img
							src={`/assets/${portraitAsset}.jpg`}
							alt={npcName}
							className={styles.portraitImage}
						/>
					</div>
				</div>

				{/* Dialogue Section */}
				<div className={styles.dialogueSection}>
					{/* Name Bubble */}
					<div className={styles.nameBubbleContainer}>
						<div className={styles.nameBubble}>{npcName}</div>
					</div>

					{/* Text Bubble */}
					<div className={styles.textBubble}>
						{/* Progress Indicator */}
						<div className={styles.progressBar}>
							<div
								className={styles.progressFill}
								style={{
									width: `${((currentLineIndex + 1) / dialogueLines.length) * 100}%`
								}}
							/>
						</div>
						<p className={styles.dialogueText}>{displayedText}</p>

						{/* Spacebar hint - appears after 5 seconds */}
						{showHint && (
							<p className={styles.spacebarHint}>Aperte ESPAÇO para continuar</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default DialogueBox;
