import { useEffect, useMemo, useState } from 'react';
import { EventBus } from './shared/events/EventBus';
import type { MediaPayload, NormalizedAnswerOption, QuizQuestionRecord, Segment } from './data/questionBank';
import { getCorrectOptionId, getNormalizedOptions, questionBank } from './data/questionBank';
import StartGame from './game/main';

const shuffled = <T,>(values: readonly T[]): T[] => {
    const copy = [...values];

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
};

const dollars = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
});

const MediaBlock = ({ media }: { media: MediaPayload }) => {
    if (media.kind === 'text') {
        return <p className="media-text">{media.value}</p>;
    }

    if (media.kind === 'audio') {
        return (
            <div className="media-audio">
                <audio controls preload="metadata" aria-label="Question audio">
                    <source src={media.value} />
                    Your browser does not support the audio element.
                </audio>
                {media.transcript ? (
                    <details>
                        <summary>Transcript</summary>
                        <p>{media.transcript}</p>
                    </details>
                ) : null}
            </div>
        );
    }

    return (
        <figure className="media-figure">
            <img
                src={media.value}
                alt={media.alt ?? 'Question media'}
                loading="lazy"
                decoding="async"
            />
            {media.credit ? <figcaption>{media.credit}</figcaption> : null}
        </figure>
    );
};

const OptionContent = ({ option }: { option: NormalizedAnswerOption }) => {
    return <MediaBlock media={option.content} />;
};

export const App = () => {
    const [questionIndex, setQuestionIndex] = useState(0);
    const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState('Select an option to test the mock flow.');
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

    const shuffledOptions = useMemo(() => {
        return shuffled(normalizedOptions);
    }, [normalizedOptions]);

    const correctOptionId = getCorrectOptionId(question);

    const selectedIsCorrect = selectedOptionId === correctOptionId;

    useEffect(() => {
        const game = StartGame('game-container');

        return () => {
            game.destroy(true);
        };
    }, []);

    useEffect(() => {
        const unsubscribeIndex = EventBus.on('quiz:question-index-changed', ({ questionIndex: nextIndex }) => {
            setQuestionIndex(nextIndex % questionBank.length);
            setSelectedOptionId(null);
        });

        const unsubscribeFeedback = EventBus.on('quiz:feedback', ({ message }) => {
            setFeedback(message);
        });

        const unsubscribeProgress = EventBus.on('quiz:progress-state-changed', (state) => {
            setProgress(state);
        });

        return () => {
            unsubscribeIndex();
            unsubscribeFeedback();
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

    const goNextQuestion = () => {
        EventBus.emit('ui:request-next-question', {
            reason: 'manual'
        });
    };

    const skipLabel = `SKIP ${'🦘'.repeat(progress.skipsRemaining)}`;
    const skipDisabled = progress.skipsRemaining <= 0;

    return (
        <main className="quiz-layout" aria-label="Quiz game mock layout">
            <div id="game-container" className="phaser-host" aria-hidden="true" />

            <header className="question-panel" role="region" aria-labelledby="question-title">
                <div className="question-meta">
                    <span className="badge">Segment {progress.activeSegment}</span>
                    <span className="badge">Question Prize {dollars.format(progress.currentQuestionPrize)}</span>
                    <span className="badge">Guaranteed {dollars.format(progress.guaranteedPrize)}</span>
                    <span className="badge">
                        Cleared {progress.clearedSegments.length > 0 ? progress.clearedSegments.join(', ') : 'none'}
                    </span>
                    <span className="badge">
                        {progress.canAdvanceByAnswer ? 'Correct answer advances segment' : 'Practice question'}
                    </span>
                    <span className="badge">{question.category}</span>
                </div>
                <h1 id="question-title" className="sr-only">Question</h1>
                <MediaBlock media={question.prompt} />
            </header>

            <section className="answers-grid" data-count={shuffledOptions.length} aria-label="Answer alternatives">
                {shuffledOptions.map((option, idx) => {
                    const isSelected = selectedOptionId === option.id;
                    const isCorrect = option.id === correctOptionId;

                    const statusClass = selectedOptionId
                        ? isCorrect
                            ? 'is-correct'
                            : isSelected
                                ? 'is-wrong'
                                : ''
                        : '';

                    const isLastOdd = shuffledOptions.length === 3 && idx === shuffledOptions.length - 1;

                    return (
                        <button
                            key={option.id}
                            type="button"
                            className={['answer-button', statusClass, isLastOdd ? 'is-last-odd' : ''].filter(Boolean).join(' ')}
                            onClick={() => onOptionSelect(option.id)}
                            aria-pressed={isSelected}
                        >
                            <OptionContent option={option} />
                        </button>
                    );
                })}
            </section>

            <nav className="actions-row" aria-label="Game controls">
                <button type="button" className="action-button" disabled aria-disabled="true">Help 1</button>
                <button type="button" className="action-button" disabled aria-disabled="true">Help 2</button>
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

            <p className="feedback" aria-live="polite">
                {progress.isGameWon
                    ? 'Jackpot reached. You can keep exploring questions for practice. 🏆'
                    : selectedOptionId
                        ? (selectedIsCorrect ? 'Correct answer ✅' : 'Not quite. Try the next question. ❌')
                        : feedback}
            </p>
        </main>
    );
};
