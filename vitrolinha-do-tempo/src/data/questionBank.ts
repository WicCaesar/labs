export type MediaKind = 'text' | 'image' | 'gif' | 'audio';

export type Segment = 1 | 2 | 3 | 4;


//* The question mark (?) indicates that this property is optional, as not all media types require alt text.
export interface MediaPayload {
	kind: MediaKind;
	value: string;
	alt?: string; // Optional alt text for image media
	transcript?: string; // Optional transcript for audio media
	credit?: string; // Optional credit information for the media source
}

export interface NormalizedAnswerOption {
	id: string; // Runtime-generated id used by UI state and list keys
	content: MediaPayload;
}

export type AnswerOptionInput = string | MediaPayload;

// Questions may have 2, 3, or 4 answer alternatives.
export type AnswerOptions =
	| [AnswerOptionInput, AnswerOptionInput]
	| [AnswerOptionInput, AnswerOptionInput, AnswerOptionInput]
	| [AnswerOptionInput, AnswerOptionInput, AnswerOptionInput, AnswerOptionInput];

export interface QuizQuestionRecord {
	id: string; // Unique identifier for the question
	segment: Segment; // Indicates which segment this question belongs to
	prizeValue: number; // The prize value for answering this question correctly
	category: string; // E.g., "General Knowledge", "Science", "History", etc.
	difficulty: 'easy' | 'medium' | 'hard';
	prompt: MediaPayload; // The question prompt, which can be text, image, audio, or gif
	options: AnswerOptions; // 2, 3, or 4 alternatives; the first option is always the correct one
	tags?: string[]; // Optional tags for categorization and filtering, e.g., ["geography", "logos", "audio"]
}

export const DEFAULT_TIME_LIMIT_SECONDS = 45;

export const SEGMENT_PRIZE_RANGES: Record<Segment, readonly [number, number]> = {
	1: [1000, 5000],
	2: [10000, 50000],
	3: [100000, 500000],
	4: [1000000, 1000000]
};

export const questionBank: QuizQuestionRecord[] = [
	{
		id: 'q-001',
		segment: 1,
		prizeValue: 2000,
		category: 'General Knowledge',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: 'Which city is known as the capital of France?'
		},
		options: [
			'Paris',
			'Berlin',
			'Madrid',
			'Rome'
		],
		tags: ['geography']
	},
	{
		id: 'q-002',
		segment: 2,
		prizeValue: 10000,
		category: 'Visual',
		difficulty: 'medium',
		prompt: {
			kind: 'image',
			value: '/assets/logo.png',
			alt: 'A stylized Phaser logo image shown in the prompt area.',
			credit: 'Local asset: public/assets/logo.png'
		},
		options: [
			'Phaser logo',
			'Unity icon',
			'Godot logo'
		],
		tags: ['logos', 'engines']
	},
	{
		id: 'q-003',
		segment: 3,
		prizeValue: 100000,
		category: 'Audio',
		difficulty: 'medium',
		prompt: {
			kind: 'audio',
			value: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
			transcript: 'A short dinosaur roar sound clip.',
			credit: 'MDN interactive examples audio'
		},
		options: [
			'This sound is a dinosaur roar',
			'This sound is NOT a dinosaur roar'
		],
		tags: ['audio']
	},
	{
		id: 'q-004',
		segment: 4,
		prizeValue: 1000000,
		category: 'Animated Image',
		difficulty: 'hard',
		prompt: {
			kind: 'gif',
			value: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
			alt: 'A looping animated reaction GIF.',
			credit: 'Giphy'
		},
		options: [
			'This is an animated GIF',
			'This is a static PNG',
			'This is an MP3 file',
			'This is a plain text file'
		],
		tags: ['gif', 'media']
	},
	{
		id: 'q-005',
		segment: 1,
		prizeValue: 5000,
		category: 'Visual Identity',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: "Which of the following images is Phaser's logo?"
		},
		options: [
			{
				kind: 'image',
				value: '/assets/logo.png',
				alt: 'Phaser logo in white on a transparent background.',
				credit: 'Local asset: public/assets/logo.png'
			},
			{
				kind: 'image',
				value: 'https://cdn.simpleicons.org/react/61DAFB',
				alt: 'React logo in cyan.',
				credit: 'Simple Icons'
			},
			{
				kind: 'image',
				value: 'https://cdn.simpleicons.org/vite/646CFF',
				alt: 'Vite logo in violet and yellow.',
				credit: 'Simple Icons'
			},
			{
				kind: 'image',
				value: 'https://cdn.simpleicons.org/godotengine/478CBF',
				alt: 'Godot Engine logo in blue.',
				credit: 'Simple Icons'
			}
		],
		tags: ['logos', 'image-options', 'phaser']
	},
	{
		id: 'q-006',
		segment: 1,
		prizeValue: 50000,
		category: 'Template Assets',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Which of these images is the background asset used in the template?'
		},
		options: [
			{
				kind: 'image',
				value: '/assets/bg.png',
				alt: 'Blue sky styled background image from the Phaser template.',
				credit: 'Local asset: public/assets/bg.png'
			},
			{
				kind: 'image',
				value: '/assets/logo.png',
				alt: 'Phaser logo image.',
				credit: 'Local asset: public/assets/logo.png'
			},
			{
				kind: 'image',
				value: 'https://cdn.simpleicons.org/react/61DAFB',
				alt: 'React logo in cyan.',
				credit: 'Simple Icons'
			},
			{
				kind: 'image',
				value: 'https://cdn.simpleicons.org/typescript/3178C6',
				alt: 'TypeScript logo in blue.',
				credit: 'Simple Icons'
			}
		],
		tags: ['assets', 'image-options', 'template']
	},
	{
		id: 'q-007',
		segment: 1,
		prizeValue: 500000,
		category: 'Audio Choices',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Which answer option is the dinosaur roar audio clip?'
		},
		options: [
			{
				kind: 'audio',
				value: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
				transcript: 'A short dinosaur roar sound clip.',
				credit: 'MDN interactive examples audio'
			},
			{
				kind: 'audio',
				value: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
				transcript: 'A short generic sample audio clip.',
				credit: 'Samplelib'
			},
			{
				kind: 'audio',
				value: 'https://samplelib.com/lib/preview/mp3/sample-6s.mp3',
				transcript: 'A short generic sample audio clip with a longer duration.',
				credit: 'Samplelib'
			},
			{
				kind: 'audio',
				value: 'https://samplelib.com/lib/preview/mp3/sample-9s.mp3',
				transcript: 'A generic sample audio clip lasting a few more seconds.',
				credit: 'Samplelib'
			}
		],
		tags: ['audio-options', 'media-answers']
	},
	{
		id: 'q-008',
		segment: 1,
		prizeValue: 1000000,
		category: 'Mixed Media',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Which alternative is a sound clip instead of an animated image?'
		},
		options: [
			{
				kind: 'audio',
				value: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
				transcript: 'A short dinosaur roar sound clip.',
				credit: 'MDN interactive examples audio'
			},
			{
				kind: 'gif',
				value: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
				alt: 'A looping reaction GIF.',
				credit: 'Giphy'
			},
			{
				kind: 'gif',
				value: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
				alt: 'A looping celebratory animated GIF.',
				credit: 'Giphy'
			},
			{
				kind: 'gif',
				value: 'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif',
				alt: 'A looping animated GIF with colorful movement.',
				credit: 'Giphy'
			}
		],
		tags: ['mixed-media', 'gif', 'audio-options']
	}
];

const toMediaPayload = (option: AnswerOptionInput): MediaPayload => {
	if (typeof option === 'string') {
		return {
			kind: 'text',
			value: option
		};
	}

	return option;
};

export const getNormalizedOptions = (question: QuizQuestionRecord): NormalizedAnswerOption[] => {
	return question.options.map((option, index) => ({
		id: `${question.id}-option-${index}`,
		content: toMediaPayload(option)
	}));
};

export const getCorrectOptionId = (question: QuizQuestionRecord): string => {
	return `${question.id}-option-0`;
};

export const getQuestionsForSegment = (segment: Segment): QuizQuestionRecord[] => {
	return questionBank.filter((question) => question.segment === segment);
};
