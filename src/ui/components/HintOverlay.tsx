export const HintOverlay = ({
	hint,
	onDismiss,
	ariaLabel = 'Dica'
}: {
	hint: string;
	onDismiss: () => void;
	ariaLabel?: string;
}) => {
	return (
		<div
			className="quiz-hint-overlay"
			role="dialog"
			aria-modal="true"
			aria-label={ariaLabel}
			onClick={onDismiss}
		>
			<div className="quiz-hint-panel">
				<p className="quiz-hint-message" aria-live="polite">Dica: {hint}</p>
			</div>
		</div>
	);
};
