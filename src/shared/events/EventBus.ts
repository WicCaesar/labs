export type AppEventMap = {
	'world:color-filter-state-changed': {
		mode: 'none' | 'grayscale' | 'blue-unlocked';
	};
	'ui:request-next-question': {
		reason: 'manual' | 'auto';
	};
	'quiz:answer-selected': {
		questionId: string;
		optionId: string;
		isCorrect: boolean;
		segment: 1 | 2 | 3 | 4;
	};
	'quiz:question-index-changed': {
		questionIndex: number;
	};
	'quiz:question-changed': {
		questionId: string;
		segment: 1 | 2 | 3 | 4;
	};
	'quiz:feedback': {
		message: string;
		tone: 'success' | 'error' | 'info';
	};
	'quiz:progress-state-changed': {
		activeSegment: 1 | 2 | 3 | 4;
		clearedSegments: Array<1 | 2 | 3 | 4>;
		guaranteedPrize: number;
		currentQuestionPrize: number;
		canAdvanceByAnswer: boolean;
		isGameWon: boolean;
		skipsRemaining: number;
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
