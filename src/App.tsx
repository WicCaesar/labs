import { useEffect, useMemo, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { EventBus } from './shared/events/EventBus';
import type { WorldColorFilterMode } from './shared/events/EventBus';
import type { QuizQuestionRecord, Segment } from './data/questionBank';
import { getCorrectOptionId, getNormalizedOptions, questionBank } from './data/questionBank';
import StartGame from './game/main';
import { useDungeonQuizFlow } from './ui/hooks/useDungeonQuizFlow';
import { HELP2_CARD_META } from './ui/hooks/quizAssist';
import { useStandaloneQuizAssistFlow } from './ui/hooks/useStandaloneQuizAssistFlow';
import DialogueBox from './ui/components/DialogueBox';
import { MediaBlock, OptionContent } from './ui/components/QuizMedia';
import { HintOverlay } from './ui/components/HintOverlay';
import { ThemeTextDrawer } from './ui/components/ThemeTextDrawer';

export const App = () => {
	const isDungeonMode = useMemo(() => window.location.hash.toLowerCase().includes('dungeon'), []);
	const [worldFilterMode, setWorldFilterMode] = useState<WorldColorFilterMode>('none');
	const [dungeonInteractableNotice, setDungeonInteractableNotice] = useState<string | null>(null);
	const [dungeonTip, setDungeonTip] = useState<{ message: string; durationMs: number } | null>(null);
	const [dialogueState, setDialogueState] = useState<{
		isActive: boolean;
		npcName: string;
		dialogueLines: string[];
		portraitAsset?: string;
		onCompleteQuizId?: 'blue' | 'yellow' | null;
	}>({
		isActive: false,
		npcName: '',
		dialogueLines: [],
		portraitAsset: undefined,
		onCompleteQuizId: null
	});
	const {
		dungeonQuiz,
		dungeonQuizHeadingRef,
		dungeonQuizCurrentQuestion,
		dungeonQuizProgressLabel,
		dungeonQuizVisibleOptions,
		dungeonHintLabel,
		dungeonSkipLabel,
		dungeonHintDisabled,
		dungeonSkipDisabled,
		dungeonHelp2Disabled,
		useDungeonQuizHint,
		dismissDungeonQuizHint,
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
		hintDisabled,
		hintLabel,
		currentHint,
		openHelp2,
		revealHelp2Card,
		useHint,
		dismissHint
	} = useStandaloneQuizAssistFlow({
		questionId: question.id,
		normalizedOptions,
		correctOptionId,
		hints: question.hints,
		isAnswerLocked: selectedOptionId !== null,
		isGameWon: progress.isGameWon
	});

	const questionPromptText = question.prompt.kind === 'text'
		? null
		: (question.promptText ?? 'Observe o que está abaixo e escolha a resposta mais adequada.');

	useEffect(() => {
		const game = StartGame('game-container');

		const handleVisibilityChange = () => {
			if (document.hidden) {
				document.querySelectorAll('audio').forEach((audio) => {
					if (!audio.paused) {
						audio.pause();
					}
				});
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			game.destroy(true);
		};
	}, [isDungeonMode]);

	useEffect(() => {
		if (!isDungeonMode) {
			setWorldFilterMode('none');
			return;
		}

		setWorldFilterMode('grayscale');

		const unsubscribeWorld = EventBus.on('world:color-filter-state-changed', ({ mode }) => {
			setWorldFilterMode(mode);
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

		const unsubscribeDialogue = EventBus.on('dungeon:dialogue-requested', ({ 
			npcName, 
			dialogueLines, 
			portraitAsset, 
			onCompleteQuizId 
		}) => {
			setDialogueState({
				isActive: true,
				npcName,
				dialogueLines,
				portraitAsset,
				onCompleteQuizId
			});
		});

		let clearTipTimer = 0;
		const unsubscribeTip = EventBus.on('dungeon:show-tip', ({ message, durationMs = 5000 }) => {
			setDungeonTip({ message, durationMs });
			if (clearTipTimer > 0) {
				window.clearTimeout(clearTipTimer);
			}
			clearTipTimer = window.setTimeout(() => {
				setDungeonTip(null);
			}, durationMs);
		});

		return () => {
			unsubscribeWorld();
			unsubscribeInteractable();
			unsubscribeDialogue();
			unsubscribeTip();
			if (clearTipTimer > 0) {
				window.clearTimeout(clearTipTimer);
			}
		};
	}, [isDungeonMode]);

	useEffect(() => {
		if (!isDungeonMode) return;

		const handleKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.code === 'Space' && !event.repeat) {
				event.preventDefault();
				if (dungeonInteractableNotice) {
					setDungeonInteractableNotice(null);
				}
				if (dungeonTip) {
					setDungeonTip(null);
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isDungeonMode, dungeonInteractableNotice, dungeonTip]);

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

	useEffect(() => {
		const hasVisibleHint = Boolean(currentHint || dungeonQuiz.currentHint);
		if (!hasVisibleHint) {
			return;
		}

		const handleSpaceDismissHint = (event: globalThis.KeyboardEvent) => {
			if (event.code !== 'Space') {
				return;
			}

			event.preventDefault();
			dismissHint();
			dismissDungeonQuizHint();
		};

		window.addEventListener('keydown', handleSpaceDismissHint);
		return () => {
			window.removeEventListener('keydown', handleSpaceDismissHint);
		};
	}, [currentHint, dungeonQuiz.currentHint, dismissHint, dismissDungeonQuizHint]);

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
					{dungeonInteractableNotice ? (
						<aside className="dungeon-interactable-toast" aria-live="assertive">
							<span className="toast-message">{dungeonInteractableNotice}</span>
							<span className="toast-hint">[Espaço] pular</span>
						</aside>
					) : null}

					{dungeonTip ? (
						<aside className="dungeon-interactable-toast" aria-live="polite">
							<span className="toast-message">{dungeonTip.message}</span>
							<span className="toast-hint">[Espaço] pular</span>
						</aside>
					) : null}

				{dialogueState.isActive ? (
					<DialogueBox
						npcName={dialogueState.npcName}
						dialogueLines={dialogueState.dialogueLines}
						portraitAsset={dialogueState.portraitAsset}
						onComplete={() => {
							setDialogueState({ 
								...dialogueState, 
								isActive: false 
							});
							EventBus.emit('dungeon:dialogue-finished', {
								shouldStartQuiz: !!dialogueState.onCompleteQuizId,
								quizId: dialogueState.onCompleteQuizId ?? undefined
							});
						}}
					/>
				) : null}

				{dungeonQuiz.isOpen && dungeonQuizCurrentQuestion ? (
					<div className="dungeon-quiz-overlay" role="dialog" aria-modal="true" aria-labelledby="dungeon-quiz-title">
						<section className="dungeon-quiz-panel" aria-live="polite">
							<header className="dungeon-quiz-header">
								<h2 id="dungeon-quiz-title" ref={dungeonQuizHeadingRef} tabIndex={-1}>
									{dungeonQuiz.quizId === 'yellow' ? 'Quiz Amarelo Final' : 'Quiz Azul'} - {dungeonQuizProgressLabel} - Respostas corretas: {dungeonQuiz.correctAnswers}
								</h2>
							</header>

								<div className="dungeon-quiz-question">
									<p className="question-prompt-text">
										{dungeonQuizCurrentQuestion.prompt.kind === 'text'
											? dungeonQuizCurrentQuestion.prompt.value
											: (dungeonQuizCurrentQuestion.promptText ?? 'Observe o enunciado e selecione a alternativa mais adequada.')}
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
									<button
										type="button"
										className="action-button"
										onClick={useDungeonQuizHint}
										disabled={dungeonHintDisabled}
										aria-disabled={dungeonHintDisabled}
									>
										{dungeonHintLabel}
									</button>
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

								{dungeonQuiz.currentHint ? (
									<HintOverlay
										hint={dungeonQuiz.currentHint}
										onDismiss={dismissDungeonQuizHint}
										ariaLabel="Dica do quiz"
									/>
								) : null}

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
															aria-label={isRevealed ? `${meta.title} ${meta.suit}` : 'Carta virada'}
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
					<ThemeTextDrawer />
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
					<span className="badge">Prêmio da pergunta R$ {progress.currentQuestionPrize}</span>
					<span className="badge">Garantido R$ {progress.guaranteedPrize}</span>
					<span className="badge">
						Limpos {progress.clearedSegments.length > 0 ? progress.clearedSegments.join(', ') : 'nenhum'}
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
				<button
					type="button"
					className="action-button"
					onClick={useHint}
					disabled={hintDisabled}
					aria-disabled={hintDisabled}
				>
					{hintLabel}
				</button>
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

				{currentHint ? (
					<HintOverlay
						hint={currentHint}
						onDismiss={dismissHint}
						ariaLabel="Dica"
					/>
				) : null}

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
										aria-label={isRevealed ? `${meta.title} ${meta.suit}` : 'Carta virada'}
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
