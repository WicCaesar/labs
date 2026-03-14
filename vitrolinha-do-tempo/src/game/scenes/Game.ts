import { Scene } from 'phaser';
import { questionBank, SEGMENT_PRIZE_RANGES, type Segment } from '../../data/questionBank';
import { EventBus } from '../../shared/events/EventBus';

export class Game extends Scene {
    private questionIndex = 0;

    private activeSegment: Segment = 1;

    private readonly clearedSegments = new Set<Segment>();

    private guaranteedPrize = 0;

    private isGameWon = false;

    private skipsRemaining = 3;

    private readonly indicesBySegment: Record<Segment, number[]> = {
        1: [],
        2: [],
        3: [],
        4: []
    };

    private readonly questionBagBySegment: Record<Segment, number[]> = {
        1: [],
        2: [],
        3: [],
        4: []
    };

    private readonly unsubscribeHandlers: Array<() => void> = [];

    constructor() {
        super('Game');

        questionBank.forEach((question, index) => {
            this.indicesBySegment[question.segment].push(index);
        });

        this.refillSegmentBag(1);
        this.refillSegmentBag(2);
        this.refillSegmentBag(3);
        this.refillSegmentBag(4);
    }

    create() {
        this.questionIndex = this.getCurrentSegmentQuestionIndex();
        this.emitQuestionIndex();
        this.emitProgressState(true);

        this.unsubscribeHandlers.push(
            EventBus.on('ui:request-next-question', () => {
                if (this.skipsRemaining <= 0) {
                    return;
                }

                this.skipsRemaining -= 1;
                this.selectNextQuestionWithinActiveSegment();
                this.emitQuestionIndex();
                this.emitProgressState(this.canAdvanceByAnswer());
            })
        );

        this.unsubscribeHandlers.push(
            EventBus.on('quiz:answer-selected', ({ isCorrect }) => {
                if (isCorrect) {
                    this.promoteSegment();
                } else {
                    EventBus.emit('quiz:feedback', {
                        message: 'Incorrect answer. Continue in the same segment.',
                        tone: 'error'
                    });
                    this.selectNextQuestionWithinActiveSegment();
                }

                this.emitQuestionIndex();
                this.emitProgressState(this.canAdvanceByAnswer());
            })
        );

        this.events.once('shutdown', () => {
            this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
            this.unsubscribeHandlers.length = 0;
        });
    }

    private emitQuestionIndex() {
        EventBus.emit('quiz:question-index-changed', {
            questionIndex: this.questionIndex
        });
    }

    private emitProgressState(canAdvanceByAnswer: boolean) {
        const currentQuestion = questionBank[this.questionIndex];

        EventBus.emit('quiz:progress-state-changed', {
            activeSegment: this.activeSegment,
            clearedSegments: [...this.clearedSegments].sort((a, b) => a - b),
            guaranteedPrize: this.guaranteedPrize,
            currentQuestionPrize: currentQuestion.prizeValue,
            canAdvanceByAnswer,
            isGameWon: this.isGameWon,
            skipsRemaining: this.skipsRemaining
        });

        if (!this.isGameWon) {
            EventBus.emit('quiz:feedback', {
                message: canAdvanceByAnswer
                    ? 'Correct answer advances to the next segment.'
                    : 'Select an option to continue.',
                tone: 'info'
            });
        }
    }

    private canAdvanceByAnswer(): boolean {
        if (this.isGameWon) {
            return false;
        }

        const [_, segmentMaxPrize] = SEGMENT_PRIZE_RANGES[this.activeSegment];
        const currentPrize = questionBank[this.questionIndex].prizeValue;
        return currentPrize >= segmentMaxPrize;
    }

    private promoteSegment() {
        if (this.isGameWon) {
            EventBus.emit('quiz:feedback', {
                message: 'Game already completed. 🎉',
                tone: 'success'
            });
            return;
        }

        this.clearedSegments.add(this.activeSegment);
        this.guaranteedPrize = SEGMENT_PRIZE_RANGES[this.activeSegment][1];

        if (this.activeSegment === 4) {
            this.isGameWon = true;
            EventBus.emit('quiz:feedback', {
                message: 'Jackpot! You reached $1,000,000. 🏆',
                tone: 'success'
            });
            return;
        }

        this.activeSegment = (this.activeSegment + 1) as Segment;
        this.questionIndex = this.drawQuestionIndexFromCurrentSegmentBag();

        EventBus.emit('quiz:feedback', {
            message: `Correct! Welcome to segment ${this.activeSegment}.`,
            tone: 'success'
        });
    }

    private selectNextQuestionWithinActiveSegment() {
        this.questionIndex = this.drawQuestionIndexFromCurrentSegmentBag();
    }

    private getCurrentSegmentQuestionIndex(): number {
        return this.drawQuestionIndexFromCurrentSegmentBag();
    }

    private drawQuestionIndexFromCurrentSegmentBag(): number {
        const indices = this.indicesBySegment[this.activeSegment];

        if (indices.length === 0) {
            this.questionIndex = 0;
            return 0;
        }

        const bag = this.questionBagBySegment[this.activeSegment];

        if (bag.length === 0) {
            this.refillSegmentBag(this.activeSegment, this.questionIndex);
        }

        return this.questionBagBySegment[this.activeSegment].pop() ?? indices[0];
    }

    private refillSegmentBag(segment: Segment, avoidFirstIndex?: number) {
        const base = [...this.indicesBySegment[segment]];

        for (let i = base.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [base[i], base[j]] = [base[j], base[i]];
        }

        if (
            typeof avoidFirstIndex === 'number'
            && base.length > 1
            && base[base.length - 1] === avoidFirstIndex
        ) {
            [base[0], base[base.length - 1]] = [base[base.length - 1], base[0]];
        }

        this.questionBagBySegment[segment] = base;
    }
}
