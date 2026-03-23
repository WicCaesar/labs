import type { MediaPayload, NormalizedAnswerOption } from '../../data/questionBank';

export const MediaBlock = ({
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

export const OptionContent = ({
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
