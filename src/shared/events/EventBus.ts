// Public filter contract between Phaser scene state and React UI rendering.
// Combination modes represent which RGB channels are currently unlocked.
export type WorldColorFilterMode =
	| 'none'
	| 'grayscale'
	| 'blue-unlocked'
	| 'red-unlocked'
	| 'green-unlocked'
	| 'red-green-unlocked'
	| 'red-blue-unlocked'
	| 'green-blue-unlocked';

export type AppEventMap = {
	'world:color-filter-state-changed': {
		mode: WorldColorFilterMode;
	};
	'dungeon:hud-state-changed': {
		level: 1 | 2 | 3 | 4;
		status: string;
		hint: string;
		objective: string;
		canInteract: boolean;
		state:
			| 'level-one-hunt-blue'
			| 'level-one-blue-unlocked'
			| 'level-two-hunt-red'
			| 'level-two-red-unlocked'
			| 'level-three-hunt-yellow'
			| 'level-three-yellow-unlocked'
			| 'level-four-button-puzzle'
			| 'complete';
	};
	'dungeon:dialogue-requested': {
		npcName: string;
		dialogueLines: string[];
		portraitAsset?: string;
		onCompleteQuizId?: 'blue' | 'yellow' | null;
	};
	'dungeon:dialogue-finished': {
		shouldStartQuiz: boolean;
		quizId?: 'blue' | 'yellow';
	};
	'dungeon:quiz-requested': {
		quizId: 'blue' | 'yellow';
		segment: 1 | 2 | 3 | 4 | 5;
		questionCount: number;
	};
	'ui:dungeon-quiz-finished': {
		quizId: 'blue' | 'yellow';
		passed: boolean;
		correctAnswers: number;
		totalQuestions: number;
	};
	'ui:dungeon-quiz-cancelled': {
		quizId: 'blue' | 'yellow';
	};
	'dungeon:interactable-activated': {
		level: 1 | 2 | 3 | 4;
		type: 'interactable' | 'push-block' | 'button';
		position: { x: number; y: number };
		message: string;
		durationMs: number;
	};
	'ui:request-next-question': {
		reason: 'manual' | 'auto';
	};
	'quiz:answer-selected': {
		questionId: string;
		optionId: string;
		isCorrect: boolean;
		segment: 1 | 2 | 3 | 4 | 5;
	};
	'quiz:question-index-changed': {
		questionIndex: number;
	};
	'quiz:question-changed': {
		questionId: string;
		segment: 1 | 2 | 3 | 4 | 5;
	};
	'quiz:feedback': {
		message: string;
		tone: 'success' | 'error' | 'info';
	};
	'quiz:progress-state-changed': {
		activeSegment: 1 | 2 | 3 | 4 | 5;
		clearedSegments: Array<1 | 2 | 3 | 4 | 5>;
		guaranteedPrize: number;
		currentQuestionPrize: number;
		canAdvanceByAnswer: boolean;
		isGameWon: boolean;
		skipsRemaining: number;
	};
	'dungeon:collectibles-spawned': {
		levelId: 1 | 2 | 3 | 4;
		collectibles: Array<{
			id: string;
			text: string;
			position: { x: number; y: number };
		}>;
		fullText: string;
		keywords: Array<{
			id: string;
			originalCase: string;
		}>;
		themeTitle: string;
	};
	'dungeon:collectible-picked-up': {
		itemId: string;
		itemText: string;
		originalCase: string;
		keywordIndex: number;
		collectedCount: number;
		totalCount: number;
	};
	'dungeon:collectibles-cleared': {
		levelId: 1 | 2 | 3 | 4;
	};
};

class TypedEventBus {
	private readonly target = new EventTarget();

	emit<K extends keyof AppEventMap>(eventName: K, detail: AppEventMap[K]): void {
		this.target.dispatchEvent(new CustomEvent(String(eventName), { detail }));
	}

	on<K extends keyof AppEventMap>(eventName: K, listener: (detail: AppEventMap[K]) => void): () => void {
		const handler = (event: Event) => {
			const customEvent = event as CustomEvent<AppEventMap[K]>;
			listener(customEvent.detail);
		};

		this.target.addEventListener(String(eventName), handler);

		return () => {
			this.target.removeEventListener(String(eventName), handler);
		};
	}
}

export const EventBus = new TypedEventBus();
