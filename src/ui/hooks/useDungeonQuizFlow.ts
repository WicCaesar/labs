import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { MediaPayload, NormalizedAnswerOption, Segment } from '../../data/questionBank';
import { getCorrectOptionId, getNormalizedOptions, questionBank } from '../../data/questionBank';
import { EventBus } from '../../shared/events/EventBus';
import { type Help2Card, getHelp2CardValues, pickRandomHint, shuffled } from './quizAssist';

type DungeonQuizQuestion = {
	id: string;
	category: string;
	segment: Segment;
	prompt: MediaPayload;
	promptText?: string;
	hints?: [string, string];
	options: NormalizedAnswerOption[];
	correctOptionId: string;
};

type DungeonQuizState = {
	isOpen: boolean;
	quizId: 'blue' | 'yellow';
	segment: Segment;
	questionCount: number;
	questions: DungeonQuizQuestion[];
	currentQuestionIndex: number;
	correctAnswers: number;
	selectedOptionId: string | null;
	hasAnsweredCurrent: boolean;
	lastAnswerWasCorrect: boolean | null;
	removedOptionIds: string[];
	help2Deck: Help2Card[];
	isHelp2PanelOpen: boolean;
	revealedHelp2CardId: string | null;
	help2Used: boolean;
	isResolvingHelp2: boolean;
	skipsRemaining: number;
	hintsRemaining: number;
	currentHint: string | null;
	feedback: string;
};

const DUNGEON_QUIZ_DEFAULT_FEEDBACK = 'Escolha uma alternativa para responder.';
const DUNGEON_QUIZ_TRANSITION_DELAY_MS = 2500;

type DungeonQuizRoundState = Pick<
	DungeonQuizState,
	| 'selectedOptionId'
	| 'hasAnsweredCurrent'
	| 'lastAnswerWasCorrect'
	| 'removedOptionIds'
	| 'help2Deck'
	| 'isHelp2PanelOpen'
	| 'revealedHelp2CardId'
	| 'help2Used'
	| 'isResolvingHelp2'
	| 'currentHint'
	| 'feedback'
>;

const createDungeonQuizRoundState = (feedback = DUNGEON_QUIZ_DEFAULT_FEEDBACK): DungeonQuizRoundState => ({
	selectedOptionId: null,
	hasAnsweredCurrent: false,
	lastAnswerWasCorrect: null,
	removedOptionIds: [],
	help2Deck: [],
	isHelp2PanelOpen: false,
	revealedHelp2CardId: null,
	help2Used: false,
	isResolvingHelp2: false,
	currentHint: null,
	feedback
});

const createInitialDungeonQuizState = (): DungeonQuizState => ({
	isOpen: false,
	quizId: 'blue',
	segment: 1,
	questionCount: 3,
	questions: [],
	currentQuestionIndex: 0,
	correctAnswers: 0,
	...createDungeonQuizRoundState(),
	skipsRemaining: 3,
	hintsRemaining: 2,
	currentHint: null,
	feedback: DUNGEON_QUIZ_DEFAULT_FEEDBACK
});

const buildDungeonQuizQuestions = (questionCount: number, segment: Segment): DungeonQuizQuestion[] => {
	const segmentQuestions = questionBank.filter((entry) => entry.segment === segment);
	const source = segmentQuestions.length > 0 ? segmentQuestions : questionBank;
	const safeCount = Math.max(1, Math.min(questionCount, source.length));
	return shuffled(source)
		.slice(0, safeCount)
		.map((entry) => ({
			id: entry.id,
			category: entry.category,
			segment: entry.segment,
			prompt: entry.prompt,
			promptText: entry.promptText,
			hints: entry.hints,
			options: shuffled(getNormalizedOptions(entry)),
			correctOptionId: getCorrectOptionId(entry)
		}));
};

export const useDungeonQuizFlow = (isDungeonMode: boolean) => {
	const [dungeonQuiz, setDungeonQuiz] = useState<DungeonQuizState>(() => createInitialDungeonQuizState());
	const dungeonQuizHeadingRef = useRef<HTMLHeadingElement | null>(null);
	const dungeonHelp2ResolveTimeoutRef = useRef<number | null>(null);
	const dungeonAutoAdvanceTimeoutRef = useRef<number | null>(null);
	const activeDungeonQuizIdRef = useRef<'blue' | 'yellow'>('blue');

	const closeDungeonQuiz = useCallback(() => {
		const cancelledQuizId = activeDungeonQuizIdRef.current;

		setDungeonQuiz((prev) => {
			if (!prev.isOpen) {
				return prev;
			}

			if (dungeonHelp2ResolveTimeoutRef.current !== null) {
				window.clearTimeout(dungeonHelp2ResolveTimeoutRef.current);
				dungeonHelp2ResolveTimeoutRef.current = null;
			}

			if (dungeonAutoAdvanceTimeoutRef.current !== null) {
				window.clearTimeout(dungeonAutoAdvanceTimeoutRef.current);
				dungeonAutoAdvanceTimeoutRef.current = null;
			}

			return createInitialDungeonQuizState();
		});

		EventBus.emit('ui:dungeon-quiz-cancelled', {
			quizId: cancelledQuizId
		});
	}, []);

	const nextDungeonQuizQuestion = useCallback(() => {
		setDungeonQuiz((prev) => {
			if (!prev.isOpen || !prev.hasAnsweredCurrent) {
				return prev;
			}

			const nextIndex = prev.currentQuestionIndex + 1;
			if (nextIndex < prev.questions.length) {
				return {
					...prev,
					currentQuestionIndex: nextIndex,
					...createDungeonQuizRoundState()
				};
			}

			const passed = prev.correctAnswers >= prev.questionCount;
			// Dungeon contract: Phaser receives only final quiz outcome, not per-question state.
			EventBus.emit('ui:dungeon-quiz-finished', {
				quizId: prev.quizId,
				passed,
				correctAnswers: prev.correctAnswers,
				totalQuestions: prev.questionCount
			});

			return createInitialDungeonQuizState();
		});
	}, []);

	const onDungeonQuizOptionSelect = useCallback((optionId: string) => {
		setDungeonQuiz((prev) => {
			if (!prev.isOpen || prev.hasAnsweredCurrent || prev.isResolvingHelp2) {
				return prev;
			}

			const currentQuestion = prev.questions[prev.currentQuestionIndex];
			if (!currentQuestion) {
				return prev;
			}

			const isCorrect = optionId === currentQuestion.correctOptionId;
			return {
				...prev,
				selectedOptionId: optionId,
				hasAnsweredCurrent: true,
				lastAnswerWasCorrect: isCorrect,
				correctAnswers: prev.correctAnswers + (isCorrect ? 1 : 0),
				feedback: isCorrect ? 'Resposta correta. Avancando automaticamente...' : 'Resposta incorreta. Avancando automaticamente...'
			};
		});
	}, []);

	const onDungeonQuizOptionKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, optionId: string) => {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		event.preventDefault();
		onDungeonQuizOptionSelect(optionId);
	}, [onDungeonQuizOptionSelect]);

	const skipDungeonQuizQuestion = useCallback(() => {
		if (dungeonAutoAdvanceTimeoutRef.current !== null) {
			window.clearTimeout(dungeonAutoAdvanceTimeoutRef.current);
			dungeonAutoAdvanceTimeoutRef.current = null;
		}

		setDungeonQuiz((prev) => {
			if (!prev.isOpen || prev.skipsRemaining <= 0 || prev.isResolvingHelp2) {
				return prev;
			}

			const nextIndex = prev.currentQuestionIndex + 1;
			if (nextIndex < prev.questions.length) {
				return {
					...prev,
					skipsRemaining: prev.skipsRemaining - 1,
					currentQuestionIndex: nextIndex,
					...createDungeonQuizRoundState('Pergunta pulada. Essa questao nao conta como acerto.')
				};
			}

			EventBus.emit('ui:dungeon-quiz-finished', {
				quizId: prev.quizId,
				passed: false,
				correctAnswers: prev.correctAnswers,
				totalQuestions: prev.questionCount
			});

			return createInitialDungeonQuizState();
		});
	}, []);

	const openDungeonQuizHelp2 = useCallback(() => {
		setDungeonQuiz((prev) => {
			if (
				!prev.isOpen
				|| prev.help2Used
				|| prev.hasAnsweredCurrent
				|| prev.isHelp2PanelOpen
				|| prev.isResolvingHelp2
			) {
				return prev;
			}

			const currentQuestion = prev.questions[prev.currentQuestionIndex];
			if (!currentQuestion) {
				return prev;
			}

			const remainingOptions = currentQuestion.options.filter((option) => !prev.removedOptionIds.includes(option.id));
			const values = shuffled(getHelp2CardValues(remainingOptions.length));
			const deck = values.map((value, idx) => ({
				id: `${currentQuestion.id}-dungeon-help2-${idx}-${value}`,
				value
			}));

			return {
				...prev,
				help2Deck: deck,
				revealedHelp2CardId: null,
				isHelp2PanelOpen: true,
				feedback: 'Escolha um disco para remover alternativas erradas.'
			};
		});
	}, []);

	const revealDungeonQuizHelp2Card = useCallback((card: Help2Card) => {
		setDungeonQuiz((prev) => {
			if (!prev.isOpen || !prev.isHelp2PanelOpen || prev.revealedHelp2CardId) {
				return prev;
			}

			return {
				...prev,
				revealedHelp2CardId: card.id,
				isResolvingHelp2: true,
				help2Used: true
			};
		});
	}, []);

	const useDungeonQuizHint = useCallback(() => {
		setDungeonQuiz((prev) => {
			if (!prev.isOpen || prev.hintsRemaining <= 0 || prev.hasAnsweredCurrent || prev.isResolvingHelp2) {
				return prev;
			}

			const currentQuestion = prev.questions[prev.currentQuestionIndex];
			if (!currentQuestion) {
				return prev;
			}

			const hints = currentQuestion.hints ?? [];
			if (hints.length === 0) {
				return {
					...prev,
					currentHint: 'Esta pergunta não possui dica cadastrada.',
					feedback: 'Nenhuma dica disponível para esta pergunta.'
				};
			}

			const hintText = pickRandomHint(hints);
			return {
				...prev,
				hintsRemaining: prev.hintsRemaining - 1,
				currentHint: hintText,
				feedback: 'Dica revelada.'
			};
		});
	}, []);

	const dismissDungeonQuizHint = useCallback(() => {
		setDungeonQuiz((prev) => {
			if (!prev.currentHint) {
				return prev;
			}

			return {
				...prev,
				currentHint: null
			};
		});
	}, []);

	useEffect(() => {
		if (!isDungeonMode) {
			setDungeonQuiz(createInitialDungeonQuizState());
			return;
		}

		// EventBus contract: Phaser requests quiz start; React owns quiz UI and returns results.
		const unsubscribeQuizRequested = EventBus.on('dungeon:quiz-requested', ({ quizId, questionCount, segment }) => {
			activeDungeonQuizIdRef.current = quizId;
			const questions = buildDungeonQuizQuestions(questionCount, segment);
			setDungeonQuiz({
				...createInitialDungeonQuizState(),
				isOpen: true,
				quizId,
				segment,
				questionCount: questions.length,
				questions
			});
		});

		return () => {
			unsubscribeQuizRequested();
		};
	}, [isDungeonMode]);

	useEffect(() => {
		if (!dungeonQuiz.isOpen) {
			return;
		}

		dungeonQuizHeadingRef.current?.focus();
	}, [dungeonQuiz.isOpen, dungeonQuiz.currentQuestionIndex]);

	useEffect(() => {
		if (!dungeonQuiz.isOpen) {
			return;
		}

		const handleKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key !== 'Escape') {
				return;
			}

			event.preventDefault();
			closeDungeonQuiz();
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [dungeonQuiz.isOpen, closeDungeonQuiz]);

	useEffect(() => {
		if (!dungeonQuiz.isOpen || !dungeonQuiz.hasAnsweredCurrent) {
			return;
		}

		if (dungeonAutoAdvanceTimeoutRef.current !== null) {
			window.clearTimeout(dungeonAutoAdvanceTimeoutRef.current);
		}

		// Auto-advance keeps dungeon quiz pacing snappy without extra confirm clicks.
		dungeonAutoAdvanceTimeoutRef.current = window.setTimeout(() => {
			nextDungeonQuizQuestion();
			dungeonAutoAdvanceTimeoutRef.current = null;
		}, DUNGEON_QUIZ_TRANSITION_DELAY_MS);

		return () => {
			if (dungeonAutoAdvanceTimeoutRef.current !== null) {
				window.clearTimeout(dungeonAutoAdvanceTimeoutRef.current);
				dungeonAutoAdvanceTimeoutRef.current = null;
			}
		};
	}, [dungeonQuiz.isOpen, dungeonQuiz.hasAnsweredCurrent, dungeonQuiz.currentQuestionIndex, nextDungeonQuizQuestion]);

	useEffect(() => {
		if (
			!dungeonQuiz.isOpen
			|| !dungeonQuiz.isHelp2PanelOpen
			|| !dungeonQuiz.isResolvingHelp2
			|| !dungeonQuiz.revealedHelp2CardId
		) {
			return;
		}

		if (dungeonHelp2ResolveTimeoutRef.current !== null) {
			window.clearTimeout(dungeonHelp2ResolveTimeoutRef.current);
		}

		// Resolve drawn card with a short reveal delay to preserve game-show cadence.
		dungeonHelp2ResolveTimeoutRef.current = window.setTimeout(() => {
			setDungeonQuiz((prev) => {
				if (!prev.isOpen) {
					return prev;
				}

				const currentQuestion = prev.questions[prev.currentQuestionIndex];
				if (!currentQuestion) {
					return {
						...prev,
						isHelp2PanelOpen: false,
						isResolvingHelp2: false,
						revealedHelp2CardId: null
					};
				}

				const revealedCard = prev.help2Deck.find((deckCard) => deckCard.id === prev.revealedHelp2CardId);
				if (!revealedCard) {
					return {
						...prev,
						isHelp2PanelOpen: false,
						isResolvingHelp2: false,
						revealedHelp2CardId: null
					};
				}

				const visibleOptions = currentQuestion.options.filter((option) => !prev.removedOptionIds.includes(option.id));
				const wrongVisibleOptions = visibleOptions.filter((option) => option.id !== currentQuestion.correctOptionId);
				const removableCount = Math.min(revealedCard.value, wrongVisibleOptions.length);
				const removedIds = shuffled(wrongVisibleOptions)
					.slice(0, removableCount)
					.map((option) => option.id);

				return {
					...prev,
					removedOptionIds: [...prev.removedOptionIds, ...removedIds],
					isHelp2PanelOpen: false,
					isResolvingHelp2: false,
					revealedHelp2CardId: null,
					feedback: removedIds.length > 0
						? `Disco removeu ${removedIds.length} alternativa${removedIds.length > 1 ? 's' : ''}.`
						: 'O rei de paus nao removeu alternativas.'
				};
			});

			dungeonHelp2ResolveTimeoutRef.current = null;
		}, DUNGEON_QUIZ_TRANSITION_DELAY_MS);

		return () => {
			if (dungeonHelp2ResolveTimeoutRef.current !== null) {
				window.clearTimeout(dungeonHelp2ResolveTimeoutRef.current);
				dungeonHelp2ResolveTimeoutRef.current = null;
			}
		};
	}, [
		dungeonQuiz.isOpen,
		dungeonQuiz.isHelp2PanelOpen,
		dungeonQuiz.isResolvingHelp2,
		dungeonQuiz.revealedHelp2CardId,
		dungeonQuiz.currentQuestionIndex
	]);

	useEffect(() => {
		return () => {
			if (dungeonHelp2ResolveTimeoutRef.current !== null) {
				window.clearTimeout(dungeonHelp2ResolveTimeoutRef.current);
			}

			if (dungeonAutoAdvanceTimeoutRef.current !== null) {
				window.clearTimeout(dungeonAutoAdvanceTimeoutRef.current);
			}
		};
	}, []);

	const dungeonQuizCurrentQuestion = dungeonQuiz.questions[dungeonQuiz.currentQuestionIndex];
	const dungeonQuizProgressLabel = `Pergunta ${Math.min(dungeonQuiz.currentQuestionIndex + 1, Math.max(dungeonQuiz.questionCount, 1))}/${Math.max(dungeonQuiz.questionCount, 1)}`;
	const dungeonQuizVisibleOptions = useMemo(() => {
		if (!dungeonQuizCurrentQuestion) {
			return [] as NormalizedAnswerOption[];
		}

		return dungeonQuizCurrentQuestion.options.filter((option) => !dungeonQuiz.removedOptionIds.includes(option.id));
	}, [dungeonQuizCurrentQuestion, dungeonQuiz.removedOptionIds]);
	const dungeonSkipLabel = `PULAR ${'⏭️'.repeat(dungeonQuiz.skipsRemaining)}`;
	const dungeonHintLabel = `DICA ${'💡'.repeat(dungeonQuiz.hintsRemaining)}`.trim();
	const dungeonSkipDisabled = dungeonQuiz.skipsRemaining <= 0 || dungeonQuiz.hasAnsweredCurrent || dungeonQuiz.isResolvingHelp2;
	const dungeonHelp2Disabled = dungeonQuiz.help2Used || dungeonQuiz.hasAnsweredCurrent || dungeonQuiz.isHelp2PanelOpen || dungeonQuiz.isResolvingHelp2;
	const dungeonHintDisabled = dungeonQuiz.hintsRemaining <= 0 || dungeonQuiz.hasAnsweredCurrent || dungeonQuiz.isResolvingHelp2;

	return {
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
		closeDungeonQuiz,
		onDungeonQuizOptionSelect,
		onDungeonQuizOptionKeyDown,
		useDungeonQuizHint,
		dismissDungeonQuizHint,
		skipDungeonQuizQuestion,
		openDungeonQuizHelp2,
		revealDungeonQuizHelp2Card
	};
};
