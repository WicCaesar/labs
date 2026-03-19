import { useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedAnswerOption } from '../../data/questionBank';
import { type Help2Card, getHelp2CardValues, shuffled } from './quizAssist';

type UseStandaloneQuizAssistFlowArgs = {
	questionId: string;
	normalizedOptions: NormalizedAnswerOption[];
	correctOptionId: string;
	isAnswerLocked: boolean;
	isGameWon: boolean;
};

export const useStandaloneQuizAssistFlow = ({
	questionId,
	normalizedOptions,
	correctOptionId,
	isAnswerLocked,
	isGameWon
}: UseStandaloneQuizAssistFlowArgs) => {
	const [removedOptionIds, setRemovedOptionIds] = useState<string[]>([]);
	const [help2Deck, setHelp2Deck] = useState<Help2Card[]>([]);
	const [isHelp2PanelOpen, setIsHelp2PanelOpen] = useState(false);
	const [revealedHelp2CardId, setRevealedHelp2CardId] = useState<string | null>(null);
	const [help2Used, setHelp2Used] = useState(false);
	const [isResolvingHelp2, setIsResolvingHelp2] = useState(false);
	const help2ResolveTimeoutRef = useRef<number | null>(null);

	const shuffledOptions = useMemo(() => shuffled(normalizedOptions), [normalizedOptions]);

	const visibleOptions = useMemo(() => {
		return shuffledOptions.filter((option) => !removedOptionIds.includes(option.id));
	}, [removedOptionIds, shuffledOptions]);

	const openHelp2 = () => {
		if (help2Used || isAnswerLocked || isGameWon || isHelp2PanelOpen || isResolvingHelp2) {
			return;
		}

		const values = shuffled(getHelp2CardValues(visibleOptions.length));
		const deck = values.map((value, idx) => ({
			id: `${questionId}-help2-${idx}-${value}`,
			value
		}));

		setHelp2Deck(deck);
		setRevealedHelp2CardId(null);
		setIsHelp2PanelOpen(true);
	};

	const revealHelp2Card = (card: Help2Card) => {
		if (!isHelp2PanelOpen || revealedHelp2CardId) {
			return;
		}

		setRevealedHelp2CardId(card.id);
		setIsResolvingHelp2(true);
		setHelp2Used(true);

		// Mirror dungeon mode timing so helper UX feels consistent across both flows.
		help2ResolveTimeoutRef.current = window.setTimeout(() => {
			const wrongVisibleOptions = visibleOptions.filter((option) => option.id !== correctOptionId);
			const removableCount = Math.min(card.value, wrongVisibleOptions.length);
			const removedIds = shuffled(wrongVisibleOptions)
				.slice(0, removableCount)
				.map((option) => option.id);

			setRemovedOptionIds((prev) => [...prev, ...removedIds]);
			setIsHelp2PanelOpen(false);
			setIsResolvingHelp2(false);
			help2ResolveTimeoutRef.current = null;
		}, 2500);
	};

	useEffect(() => {
		// Question changes reset all per-question helper state.
		setRemovedOptionIds([]);
		setHelp2Deck([]);
		setIsHelp2PanelOpen(false);
		setRevealedHelp2CardId(null);
		setHelp2Used(false);
		setIsResolvingHelp2(false);

		if (help2ResolveTimeoutRef.current !== null) {
			window.clearTimeout(help2ResolveTimeoutRef.current);
			help2ResolveTimeoutRef.current = null;
		}
	}, [questionId]);

	useEffect(() => {
		return () => {
			if (help2ResolveTimeoutRef.current !== null) {
				window.clearTimeout(help2ResolveTimeoutRef.current);
			}
		};
	}, []);

	const help2Disabled = help2Used || isAnswerLocked || isGameWon || isHelp2PanelOpen || isResolvingHelp2;

	return {
		visibleOptions,
		help2Deck,
		isHelp2PanelOpen,
		revealedHelp2CardId,
		isResolvingHelp2,
		help2Disabled,
		openHelp2,
		revealHelp2Card
	};
};
