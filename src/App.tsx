import { useEffect, useMemo, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { EventBus } from './shared/events/EventBus';
import type { WorldColorFilterMode } from './shared/events/EventBus';
import type { MediaPayload, NormalizedAnswerOption, QuizQuestionRecord, Segment } from './data/questionBank';
import { getCorrectOptionId, getNormalizedOptions, questionBank } from './data/questionBank';
import StartGame from './game/main';
import { SCENE_KEYS } from './shared/constants/sceneKeys';
import { useDungeonQuizFlow } from './ui/hooks/useDungeonQuizFlow';
import { HELP2_CARD_META } from './ui/hooks/quizAssist';
import { useStandaloneQuizAssistFlow } from './ui/hooks/useStandaloneQuizAssistFlow';

const dollars = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 0
});

const MediaBlock = ({
	media,
	includeSupplemental = true,
	audioLabel = 'Áudio'
}: {
	media: MediaPayload;
	includeSupplemental?: boolean;
	audioLabel?: string;
}) => {
	if (media.kind === 'text') {
		return <p className="media-text">{media.value}</p>;
	}

	if (media.kind === 'audio') {
		return (
			<div className="media-audio" role="group" aria-label={audioLabel}>
				<div className="media-main">
					<audio controls preload="metadata" aria-label={audioLabel}>
						<source src={media.value} />
						Navegador sem suporte para esse áudio. Informe-nos.
					</audio>
				</div>
				{includeSupplemental ? (
					<div className="media-supplemental media-supplemental-audio">
						{media.transcript ? (
							<details>
								<summary>Transcrição</summary>
								<p>{media.transcript}</p>
							</details>
						) : <span className="media-supplemental-placeholder" aria-hidden="true" />}
						{media.credit ? (
							<p className="media-credit">Fonte: {media.credit}</p>
						) : <span className="media-supplemental-placeholder" aria-hidden="true" />}
					</div>
				) : null}
			</div>
		);
	}

	return (
		<figure className="media-figure">
			<div className="media-main">
				<img
					src={media.value}
					alt={media.alt ?? 'Mídia'}
					loading="lazy"
					decoding="async"
				/>
			</div>
			{includeSupplemental ? (
				<figcaption className="media-supplemental media-figure-caption">
					{media.credit ? `Fonte: ${media.credit}` : <span className="media-supplemental-placeholder" aria-hidden="true" />}
				</figcaption>
			) : null}
		</figure>
	);
};

const OptionContent = ({
	option,
	includeSupplemental = true
}: {
	option: NormalizedAnswerOption;
	includeSupplemental?: boolean;
}) => {
	return (
		<MediaBlock
			media={option.content}
			includeSupplemental={includeSupplemental}
			audioLabel="Áudio"
		/>
	);
};

export const App = () => {
	const isDungeonMode = useMemo(() => window.location.hash.toLowerCase().includes('dungeon'), []);
	const [worldFilterMode, setWorldFilterMode] = useState<WorldColorFilterMode>('none');
	const [dungeonHud, setDungeonHud] = useState({
		level: 1 as 1 | 2 | 3,
		status: 'Dungeon is in grayscale. Find the wandering penguin.',
		hint: 'Controls: WASD/Arrows + E to interact',
		objective: 'Unlock blue.',
		canInteract: false,
		state: 'level-one-hunt-blue' as
			| 'level-one-hunt-blue'
			| 'level-one-blue-unlocked'
			| 'level-two-hunt-red'
			| 'level-two-red-unlocked'
			| 'level-three-hunt-yellow'
			| 'complete'
	});
	const [dungeonInteractableNotice, setDungeonInteractableNotice] = useState<string | null>(null);
	const {
		dungeonQuiz,
		dungeonQuizHeadingRef,
		dungeonQuizCurrentQuestion,
		dungeonQuizProgressLabel,
		dungeonQuizVisibleOptions,
		dungeonSkipLabel,
		dungeonSkipDisabled,
		dungeonHelp2Disabled,
		onDungeonQuizOptionSelect,
		onDungeonQuizOptionKeyDown,
		skipDungeonQuizQuestion,
		openDungeonQuizHelp2,
		revealDungeonQuizHelp2Card
	} = useDungeonQuizFlow(isDungeonMode);

	const [questionIndex, setQuestionIndex] = useState(0);
	const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
	const [progress, setProgress] = useState<{
		activeSegment: Segment;
		clearedSegments: Segment[];
		guaranteedPrize: number;
		currentQuestionPrize: number;
		canAdvanceByAnswer: boolean;
		isGameWon: boolean;
		skipsRemaining: number;
	}>({
		activeSegment: 1,
		clearedSegments: [],
		guaranteedPrize: 0,
		currentQuestionPrize: questionBank[0]?.prizeValue ?? 0,
		canAdvanceByAnswer: false,
		isGameWon: false,
		skipsRemaining: 3
	});

	const question: QuizQuestionRecord = questionBank[questionIndex % questionBank.length];

	const normalizedOptions = useMemo(() => {
		return getNormalizedOptions(question);
	}, [question]);

	const correctOptionId = getCorrectOptionId(question);

	const {
		visibleOptions,
		help2Deck,
		isHelp2PanelOpen,
		revealedHelp2CardId,
		isResolvingHelp2,
		help2Disabled,
		openHelp2,
		revealHelp2Card
	} = useStandaloneQuizAssistFlow({
		questionId: question.id,
		normalizedOptions,
		correctOptionId,
		isAnswerLocked: selectedOptionId !== null,
		isGameWon: progress.isGameWon
	});

	const questionPromptText = question.prompt.kind === 'text'
		? null
		: (question.promptText ?? 'Observe o que está abaixo e escolha a resposta mais adequada.');

	useEffect(() => {
		const game = StartGame(
			'game-container',
			isDungeonMode ? SCENE_KEYS.ISOMETRIC_DUNGEON : SCENE_KEYS.QUIZ_GAME
		);

		return () => {
			game.destroy(true);
		};
	}, [isDungeonMode]);

	useEffect(() => {
		if (!isDungeonMode) {
			setWorldFilterMode('none');
			setDungeonInteractableNotice(null);
			return;
		}

		setWorldFilterMode('grayscale');

		const unsubscribeWorld = EventBus.on('world:color-filter-state-changed', ({ mode }) => {
			setWorldFilterMode(mode);
		});

		const unsubscribeHud = EventBus.on('dungeon:hud-state-changed', (hudState) => {
			setDungeonHud(hudState);
		});

		let clearNoticeTimer = 0;
		const unsubscribeInteractable = EventBus.on('dungeon:interactable-activated', ({ message, durationMs }) => {
			setDungeonInteractableNotice(message);
			if (clearNoticeTimer > 0) {
				window.clearTimeout(clearNoticeTimer);
			}

			clearNoticeTimer = window.setTimeout(() => {
				setDungeonInteractableNotice(null);
			}, durationMs);
		});

		return () => {
			if (clearNoticeTimer > 0) {
				window.clearTimeout(clearNoticeTimer);
			}
			unsubscribeWorld();
			unsubscribeHud();
			unsubscribeInteractable();
		};
	}, [isDungeonMode]);


	useEffect(() => {
		const unsubscribeIndex = EventBus.on('quiz:question-index-changed', ({ questionIndex: nextIndex }) => {
			setQuestionIndex(nextIndex % questionBank.length);
			setSelectedOptionId(null);
		});

		const unsubscribeProgress = EventBus.on('quiz:progress-state-changed', (state) => {
			setProgress(state);
		});

		return () => {
			unsubscribeIndex();
			unsubscribeProgress();
		};
	}, []);

	useEffect(() => {
		EventBus.emit('quiz:question-changed', {
			questionId: question.id,
			segment: question.segment
		});
	}, [question.id, question.segment]);

	const onOptionSelect = (optionId: string) => {
		setSelectedOptionId(optionId);

		EventBus.emit('quiz:answer-selected', {
			questionId: question.id,
			optionId,
			isCorrect: optionId === correctOptionId,
			segment: question.segment
		});
	};

	const onAnswerCardKeyDown = (event: KeyboardEvent<HTMLElement>, optionId: string) => {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		event.preventDefault();
		onOptionSelect(optionId);
	};

	const stopAnswerSelection = (event: SyntheticEvent<HTMLElement>) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		const isInteractiveMediaControl = target.closest('audio, summary, details, input, button, select, textarea');
		if (isInteractiveMediaControl) {
			event.stopPropagation();
		}
	};

	const goNextQuestion = () => {
		EventBus.emit('ui:request-next-question', {
			reason: 'manual'
		});
	};

	const skipLabel = `PULAR ${'⏭️'.repeat(progress.skipsRemaining)}`;
	const skipDisabled = progress.skipsRemaining <= 0;
	const worldFilterClass = worldFilterMode === 'none' ? '' : `world-filter-${worldFilterMode}`;

	// Filter IDs here must stay in sync with CSS classes in public/style.css
	// and WorldColorFilterMode values from the typed EventBus contract.
	const worldFilterDefs = (
		<svg className="color-filter-defs" aria-hidden="true" focusable="false">
			<defs>
				<filter id="world-filter-grayscale" colorInterpolationFilters="sRGB">
					<feColorMatrix
						type="matrix"
						values="
							0.299 0.587 0.114 0 0
							0.299 0.587 0.114 0 0
							0.299 0.587 0.114 0 0
							0     0     0     1 0
						"
					/>
				</filter>

				<filter id="world-filter-blue-unlocked" colorInterpolationFilters="sRGB">
					<feColorMatrix
						type="matrix"
						values="
							0.030 0.050 0.010 0 0.020
							0.030 0.050 0.010 0 0.020
							0.160 0.280 0.880 0 0.040
							0     0     0     1 0
						"
					/>
				</filter>

				<filter id="world-filter-red-unlocked" colorInterpolationFilters="sRGB">
					<feColorMatrix
						type="matrix"
						values="
							0.755 0.205 0.040 0 0
							0.021 0.041 0.008 0 0
							0.021 0.041 0.008 0 0
							0     0     0     1 0
						"
					/>
				</filter>

				<filter id="world-filter-green-unlocked" colorInterpolationFilters="sRGB">
					<feColorMatrix
						type="matrix"
						values="
							0.021 0.041 0.008 0 0
							0.105 0.855 0.040 0 0
							0.021 0.041 0.008 0 0
							0     0     0     1 0
						"
					/>
				</filter>

				<filter id="world-filter-red-green-unlocked" colorInterpolationFilters="sRGB">
					<feColorMatrix
						type="matrix"
						values="
							0.625 0.147 0.029 0 0
							0.075 0.697 0.029 0 0
							0     0     0     0 0
							0     0     0     1 0
						"
					/>
				</filter>

				<filter id="world-filter-red-blue-unlocked" colorInterpolationFilters="sRGB">
					<feColorMatrix
						type="matrix"
						values="
							0.625 0.147 0.029 0 0
							0     0     0     0 0
							0.075 0.147 0.579 0 0
							0     0     0     1 0
						"
					/>
				</filter>

				<filter id="world-filter-green-blue-unlocked" colorInterpolationFilters="sRGB">
					<feColorMatrix
						type="matrix"
						values="
							0     0     0     0 0
							0.075 0.697 0.029 0 0
							0.075 0.147 0.579 0 0
							0     0     0     1 0
						"
					/>
				</filter>
			</defs>
		</svg>
	);

	if (isDungeonMode) {
		return (
			<>
				{worldFilterDefs}
				<main className={`dungeon-layout ${worldFilterClass}`.trim()} aria-label="Isometric Dungeon">
					<div id="game-container" className="phaser-host is-visible" />
					<section className="dungeon-hud" aria-live="polite">
						<p className="dungeon-hud-level">Level {dungeonHud.level}</p>
						<p className="dungeon-hud-status">{dungeonHud.status}</p>
						<p className="dungeon-hud-objective">Objective: {dungeonHud.objective}</p>
						<p className="dungeon-hud-hint">{dungeonHud.hint}</p>
						<p className="dungeon-hud-controls">WASD/Arrows to move. E to interact.</p>
						{dungeonHud.canInteract ? <span className="dungeon-hud-ready">Interaction available</span> : null}
					</section>
					{dungeonInteractableNotice ? (
						<aside className="dungeon-interactable-toast" aria-live="assertive">
							{dungeonInteractableNotice}
						</aside>
					) : null}

					{dungeonQuiz.isOpen && dungeonQuizCurrentQuestion ? (
						<div className="dungeon-quiz-overlay" role="dialog" aria-modal="true" aria-labelledby="dungeon-quiz-title">
							<section className="dungeon-quiz-panel" aria-live="polite">
								<header className="dungeon-quiz-header">
									<h2 id="dungeon-quiz-title" ref={dungeonQuizHeadingRef} tabIndex={-1}>
										{dungeonQuiz.quizId === 'yellow' ? 'Final Yellow Quiz' : 'Blue Quiz'} - {dungeonQuizProgressLabel} - Respostas corretas: {dungeonQuiz.correctAnswers}
									</h2>
								</header>

								<div className="dungeon-quiz-question">
									<p className="question-prompt-text">
										{dungeonQuizCurrentQuestion.prompt.kind === 'text'
											? dungeonQuizCurrentQuestion.prompt.value
											: (dungeonQuizCurrentQuestion.promptText ?? 'Observe the prompt and select the most suitable option.')}
									</p>
									{dungeonQuizCurrentQuestion.prompt.kind === 'text'
										? null
										: <MediaBlock media={dungeonQuizCurrentQuestion.prompt} />}
								</div>

								<section className="answers-grid" data-count={dungeonQuizVisibleOptions.length} aria-label="Dungeon quiz answers">
									{dungeonQuizVisibleOptions.map((option, idx) => {
										const isSelected = dungeonQuiz.selectedOptionId === option.id;
										const isCorrect = option.id === dungeonQuizCurrentQuestion.correctOptionId;

										const statusClass = dungeonQuiz.hasAnsweredCurrent
											? isCorrect
												? 'is-correct'
												: isSelected
													? 'is-wrong'
													: ''
											: '';

										const isLastOdd = dungeonQuizVisibleOptions.length === 3 && idx === dungeonQuizVisibleOptions.length - 1;

										if (option.content.kind === 'audio') {
											return (
												<div
													key={option.id}
													role="button"
													tabIndex={0}
													className={[
														'answer-option-card',
														'has-separate-controls',
														statusClass,
														isLastOdd ? 'is-last-odd' : ''
													].filter(Boolean).join(' ')}
													onClick={() => onDungeonQuizOptionSelect(option.id)}
													onKeyDown={(event) => onDungeonQuizOptionKeyDown(event, option.id)}
													aria-pressed={isSelected}
													aria-disabled={dungeonQuiz.hasAnsweredCurrent}
												>
													<div
														className="answer-option-media"
														onClick={stopAnswerSelection}
														onKeyDown={stopAnswerSelection}
													>
														<OptionContent option={option} includeSupplemental />
													</div>
												</div>
											);
										}

										return (
											<div
												key={option.id}
												className={[
													'answer-option-card',
													isLastOdd ? 'is-last-odd' : ''
												].filter(Boolean).join(' ')}
											>
												<button
													type="button"
													className={['answer-button', statusClass].filter(Boolean).join(' ')}
													onClick={() => onDungeonQuizOptionSelect(option.id)}
													disabled={dungeonQuiz.hasAnsweredCurrent}
													aria-pressed={isSelected}
												>
													<OptionContent option={option} />
												</button>
											</div>
										);
									})}
								</section>

								<nav className="actions-row" aria-label="Dungeon quiz helpers">
									<button type="button" className="action-button" disabled aria-disabled="true">AJUDA 1</button>
									<button
										type="button"
										className="action-button"
										onClick={openDungeonQuizHelp2}
										disabled={dungeonHelp2Disabled}
										aria-disabled={dungeonHelp2Disabled}
									>
										DISCOS
									</button>
									<button
										type="button"
										className="action-button"
										onClick={skipDungeonQuizQuestion}
										disabled={dungeonSkipDisabled}
										aria-disabled={dungeonSkipDisabled}
									>
										{dungeonSkipLabel}
									</button>
								</nav>

								{dungeonQuiz.isHelp2PanelOpen ? (
									<div className="help2-overlay" role="dialog" aria-modal="true" aria-label="Elimine alternativas erradas com os discos.">
										<div className="help2-panel">
											<h2>Escolha um disco</h2>
											<p>Os discos podem ajudar a eliminar alternativas erradas.</p>
											<div className="help2-cards-grid">
												{dungeonQuiz.help2Deck.map((card) => {
													const isRevealed = dungeonQuiz.revealedHelp2CardId === card.id;
													const meta = HELP2_CARD_META[card.value];

													return (
														<button
															key={card.id}
															type="button"
															className={[
																'help2-card',
																isRevealed ? 'is-revealed' : 'is-facedown',
																isRevealed ? `face-${card.value}` : ''
															].filter(Boolean).join(' ')}
															onClick={() => revealDungeonQuizHelp2Card(card)}
															disabled={dungeonQuiz.isResolvingHelp2 && !isRevealed}
															aria-disabled={dungeonQuiz.isResolvingHelp2 && !isRevealed}
															aria-label={isRevealed ? `${meta.title} ${meta.suit}` : 'Face-down card'}
														>
															{isRevealed ? (
																<span className="help2-card-content">
																	<strong>{meta.title}</strong>
																	<span className="help2-card-suit">{meta.suit}</span>
																	<small>
																		{meta.removed === 0
																			? 'Remove 0'
																			: `Remove ${meta.removed}`}
																	</small>
																</span>
															) : (
																<span className="help2-card-back">?</span>
															)}
														</button>
													);
												})}
											</div>
										</div>
									</div>
								) : null}
							</section>
						</div>
					) : null}
				</main>
			</>
		);
	}

	return (
		<>
			{worldFilterDefs}
			<main className={`quiz-layout ${worldFilterClass}`.trim()} aria-label="Vitrolinha do Tempo">
			<div id="game-container" className="phaser-host" aria-hidden="true" />

			<header className="question-panel" role="region" aria-labelledby="question-title">
				<div className="question-meta">
					<span className="badge">Segmento {progress.activeSegment}</span>
					<span className="badge">Prêmio da pergunta {dollars.format(progress.currentQuestionPrize)}</span>
					<span className="badge">Garantido {dollars.format(progress.guaranteedPrize)}</span>
					<span className="badge">
						Cleared {progress.clearedSegments.length > 0 ? progress.clearedSegments.join(', ') : 'none'}
					</span>
					<span className="badge">
						{progress.canAdvanceByAnswer ? 'Valendo' : 'Treino'}
					</span>
					<span className="badge">{question.category}</span>
				</div>
				<h1 id="question-title" className="sr-only">Pergunta</h1>
				{questionPromptText ? <p className="question-prompt-text">{questionPromptText}</p> : null}
				<MediaBlock media={question.prompt} />
			</header>

			<section className="answers-grid" data-count={visibleOptions.length} aria-label="Alternativas">
				{visibleOptions.map((option, idx) => {
					const isSelected = selectedOptionId === option.id;
					const isCorrect = option.id === correctOptionId;

					const statusClass = selectedOptionId
						? isCorrect
							? 'is-correct'
							: isSelected
								? 'is-wrong'
								: ''
						: '';

					const isLastOdd = visibleOptions.length === 3 && idx === visibleOptions.length - 1;

					return (
						option.content.kind === 'audio' ? (
							<div
								key={option.id}
								role="button"
								tabIndex={0}
								className={[
									'answer-option-card',
									'has-separate-controls',
									statusClass,
									isLastOdd ? 'is-last-odd' : ''
								].filter(Boolean).join(' ')}
								onClick={() => onOptionSelect(option.id)}
								onKeyDown={(event) => onAnswerCardKeyDown(event, option.id)}
								aria-pressed={isSelected}
							>
								<div
									className="answer-option-media"
									onClick={stopAnswerSelection}
									onKeyDown={stopAnswerSelection}
								>
									<OptionContent option={option} includeSupplemental />
								</div>
							</div>
						) : (
							<div
								key={option.id}
								className={[
									'answer-option-card',
									isLastOdd ? 'is-last-odd' : ''
								].filter(Boolean).join(' ')}
							>
								<button
									type="button"
									className={['answer-button', statusClass].filter(Boolean).join(' ')}
									onClick={() => onOptionSelect(option.id)}
									aria-pressed={isSelected}
								>
									<OptionContent option={option} />
								</button>
							</div>
						)
					);
				})}
			</section>

			<nav className="actions-row" aria-label="Assistentes">
				<button type="button" className="action-button" disabled aria-disabled="true">AJUDA 1</button>
				<button
					type="button"
					className="action-button"
					onClick={openHelp2}
					disabled={help2Disabled}
					aria-disabled={help2Disabled}
				>
					DISCOS
				</button>
				<button
					type="button"
					className="action-button"
					onClick={goNextQuestion}
					disabled={skipDisabled}
					aria-disabled={skipDisabled}
					>
					{skipLabel}
				</button>
			</nav>

			{isHelp2PanelOpen ? (
				<div className="help2-overlay" role="dialog" aria-modal="true" aria-label="Elimine alternativas erradas com os discos.">
					<div className="help2-panel">
						<h2>Escolha um disco</h2>
						<p>Os discos podem ajudar a eliminar alternativas erradas.</p>
						<div className="help2-cards-grid">
							{help2Deck.map((card) => {
								const isRevealed = revealedHelp2CardId === card.id;
								const meta = HELP2_CARD_META[card.value];

								return (
									<button
										key={card.id}
										type="button"
										className={[
											'help2-card',
											isRevealed ? 'is-revealed' : 'is-facedown',
											isRevealed ? `face-${card.value}` : ''
										].filter(Boolean).join(' ')}
										onClick={() => revealHelp2Card(card)}
										disabled={isResolvingHelp2 && !isRevealed}
										aria-disabled={isResolvingHelp2 && !isRevealed}
										aria-label={isRevealed ? `${meta.title} ${meta.suit}` : 'Face-down card'}
									>
										{isRevealed ? (
											<span className="help2-card-content">
												<strong>{meta.title}</strong>
												<span className="help2-card-suit">{meta.suit}</span>
												<small>
													{meta.removed === 0
														? 'Remove 0'
														: `Remove ${meta.removed}`}
												</small>
											</span>
										) : (
											<span className="help2-card-back">?</span>
										)}
									</button>
								);
							})}
						</div>
					</div>
				</div>
			) : null}
			</main>
		</>
	);
};
