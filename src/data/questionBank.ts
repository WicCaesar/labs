export type MediaKind = 'text' | 'image' | 'gif' | 'audio';

export type Segment = 1 | 2 | 3 | 4 | 5;


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
	promptText?: string; // Optional text shown together with non-text prompts (image/gif/audio/video)
	hints?: [string, string]; // Optional hints shown by the DICA assistance
	options: AnswerOptions; // 2, 3, or 4 alternatives; the first option is always the correct one
	tags?: string[]; // Optional tags for categorization and filtering, e.g., ["geography", "logos", "audio"]
}

export const DEFAULT_TIME_LIMIT_SECONDS = 45;

export const SEGMENT_PRIZE_RANGES: Record<Segment, readonly [number, number]> = {
	1: [1000, 5000],
	2: [10000, 50000],
	3: [100000, 500000],
	4: [1000000, 1000000],
	5: [2000000, 5000000]
};

export const questionBank: QuizQuestionRecord[] = [
	/* {
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
		},
		promptText: 'Which game engine logo is shown in the image?',
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
		promptText: 'Listen to the audio and choose the correct statement.',
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
		},
		promptText: 'What type of media is being shown above?',
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
			},
			{
				kind: 'image',
				value: '/assets/logo.png',
				alt: 'Phaser logo image.',
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
			},
			{
				kind: 'gif',
				value: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
				alt: 'A looping reaction GIF.',
			},
			{
				kind: 'gif',
				value: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
				alt: 'A looping celebratory animated GIF.',
			},
			{
				kind: 'gif',
				value: 'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif',
				alt: 'A looping animated GIF with colorful movement.',
			}
		],
		tags: ['mixed-media', 'gif', 'audio-options']
		},*/

	// ── Segmento 1 — Cubismo (fácil) ──────────────────────────────────────────

	{
		id: 'q-009',
		segment: 1,
		prizeValue: 1000,
		category: 'Cubismo',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: 'Quem é considerado o co-criador do Cubismo, ao lado de Georges Braque?'
		},
		options: [
			'Pablo Picasso',
			'Salvador Dalí',
			'Henri Matisse',
			'Marcel Duchamp'
		],
		hints: [
			'Pense em um pintor espanhol nascido em Málaga.',
			'Ele também é autor de "Guernica".'
		],
		tags: ['cubismo', 'artistas']
	},
	{
		id: 'q-010',
		segment: 1,
		prizeValue: 2000,
		category: 'Cubismo',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: 'Em que país nasceu Pablo Picasso, um dos fundadores do Cubismo?'
		},
		options: [
			'Espanha',
			'França',
			'Itália',
			'Portugal'
		],
		hints: [
			'É um país da Península Ibérica.',
			'É o mesmo país de origem de Gaudí.'
		],
		tags: ['cubismo', 'artistas', 'geografia']
	},
	{
		id: 'q-011',
		segment: 1,
		prizeValue: 3000,
		category: 'Cubismo',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: 'O Cubismo surgiu no início de qual século?'
		},
		options: [
			'Século XX',
			'Século XIX',
			'Século XVIII',
			'Século XXI'
		],
		hints: [
			'O movimento começa por volta de 1907.',
			'Pense no século que vai de 1901 a 2000.'
		],
		tags: ['cubismo', 'história']
	},

	// ── Segmento 2 — Cubismo (fácil a intermediário baixo) ────────────────────

	{
		id: 'q-012',
		segment: 2,
		prizeValue: 10000,
		category: 'Cubismo',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: 'Qual é o nome da famosa pintura de Picasso, de 1907, que retrata cinco figuras femininas e é considerada a grande precursora do Cubismo?'
		},
		options: [
			'Les Demoiselles d\'Avignon',
			'Guernica',
			'O Sonho',
			'La Vie'
		],
		hints: [
			'O título da obra está em francês.',
			'Cita uma cidade.'
		],
		tags: ['cubismo', 'obras', 'picasso']
	},
	{
		id: 'q-013',
		segment: 2,
		prizeValue: 20000,
		category: 'Cubismo',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: 'Qual é a principal característica visual do Cubismo?'
		},
		options: [
			'Representação de objetos em múltiplas perspectivas simultâneas',
			'Uso exclusivo de cores primárias vivas',
			'Pinceladas longas e curvilíneas',
			'Retrato hiperrealista da natureza'
		],
		hints: [
			'O estilo quebra o objeto em planos e ângulos.',
			'A ideia principal é mostrar mais de um ponto de vista ao mesmo tempo.'
		],
		tags: ['cubismo', 'conceitos']
	},
	{
		id: 'q-014',
		segment: 2,
		prizeValue: 50000,
		category: 'Cubismo',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Qual vertente da arte africana influenciou diretamente Picasso no desenvolvimento do estilo cubista?'
		},
		options: [
			'Máscaras e esculturas africanas subsaarianas',
			'Pinturas rupestres do Saara',
			'Esculturas do antigo Egito',
			'Cerâmicas do norte da África'
		],
		hints: [
			'A influência veio de objetos tridimensionais e estilizados.',
			'Pense em artefatos rituais vistas por artistas de vanguarda em Paris.'
		],
		tags: ['cubismo', 'influências', 'arte-africana']
	},
	{
		id: 'q-015',
		segment: 2,
		prizeValue: 30000,
		category: 'Cubismo',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Em que cidade Picasso e Braque desenvolveram o Cubismo, frequentando os mesmos círculos artísticos de vanguarda?'
		},
		options: [
			'Paris',
			'Marselha',
			'Madri',
			'Bordéus'
		],
		hints: [
			'É um lugar onde se fala francês.',
			'É a cidade de Montmartre e dos grandes ateliês de vanguarda.'
		],
		tags: ['cubismo', 'história', 'geografia']
	},

	// ── Segmento 3 — Cubismo (fácil a intermediário baixo) ────────────────────

	{
		id: 'q-016',
		segment: 3,
		prizeValue: 100000,
		category: 'Cubismo',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Como se chama a primeira fase do Cubismo, marcada por formas fortemente fragmentadas e paleta monocromática em cinzas e marrons?'
		},
		options: [
			'Cubismo Analítico',
			'Cubismo Sintético',
			'Cubismo Órfico',
			'Cubismo Purista'
		],
		hints: [
			'É a fase inicial do movimento.',
			'O nome dessa fase sugere decompor e examinar formas.'
		],
		tags: ['cubismo', 'fases', 'conceitos']
	},
	{
		id: 'q-017',
		segment: 3,
		prizeValue: 200000,
		category: 'Cubismo',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Como se chama a segunda fase do Cubismo, que introduziu a colagem e uma paleta de cores mais vibrantes?'
		},
		options: [
			'Cubismo Sintético',
			'Cubismo Analítico',
			'Cubismo Abstrato',
			'Cubismo Futurista'
		],
		hints: [
			'É a fase posterior ao analítico.',
			'Essa etapa introduz colagem e simplificação das formas.'
		],
		tags: ['cubismo', 'fases', 'conceitos']
	},
	{
		id: 'q-018',
		segment: 3,
		prizeValue: 300000,
		category: 'Cubismo',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Quem cunhou o termo "Cubismo" pela primeira vez, em crítica de arte publicada em 1908?'
		},
		options: [
			'Louis Vauxcelles',
			'Guillaume Apollinaire',
			'Daniel-Henry Kahnweiler',
			'Gertrude Stein'
		],
		hints: [
			'Foi um crítico de arte francês.',
			'É o mesmo crítico associado ao termo "fauves".'
		],
		tags: ['cubismo', 'história', 'crítica']
	},
	{
		id: 'q-019',
		segment: 3,
		prizeValue: 500000,
		category: 'Cubismo',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Qual técnica inovadora Georges Braque introduziu no Cubismo Sintético por volta de 1912, colando recortes de papel e outros materiais diretamente sobre a tela?'
		},
		options: [
			'Papier collé',
			'Pointilhismo',
			'Sfumato',
			'Impasto'
		],
		hints: [
			'A técnica envolve colar materiais sobre a superfície da obra.',
			'O nome está em francês.'
		],
		tags: ['cubismo', 'técnicas', 'braque']
	},

	// ── Segmento 4 — Cubismo (intermediário baixo) ────────────────────────────

	{
		id: 'q-020',
		segment: 4,
		prizeValue: 1000000,
		category: 'Cubismo',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Em qual museu de Nova Iorque está permanentemente exposta "Les Demoiselles d\'Avignon", de Picasso?'
		},
		options: [
			'Museu de Arte Moderna (MoMA)',
			'Metropolitan Museum of Art',
			'Museu Guggenheim',
			'Whitney Museum of American Art'
		],
		hints: [
			'É um museu de arte moderna muito conhecido em Nova Iorque.',
			'A sigla de quatro letras é bastante famosa.'
		],
		tags: ['cubismo', 'museus', 'obras']
	},
	{
		id: 'q-021',
		segment: 4,
		prizeValue: 1000000,
		category: 'Cubismo',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Qual pintura de Picasso, de 1937, retrata os horrores do bombardeio de uma cidade basca durante a Guerra Civil Espanhola, usando elementos cubistas em composição dramática?'
		},
		options: [
			'Guernica',
			'Les Demoiselles d\'Avignon',
			'O Touro',
			'Mulher Chorando'
		],
		hints: [
			'A obra tem nome de uma cidade basca bombardeada.',
			'É uma pintura monumental em tons de preto, branco e cinza.'
		],
		tags: ['cubismo', 'picasso', 'obras', 'história']
	},
	{
		id: 'q-022',
		segment: 4,
		prizeValue: 1000000,
		category: 'Cubismo',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Juan Gris foi um dos grandes mestres do Cubismo Sintético. De qual país ele era originário?'
		},
		options: [
			'Espanha',
			'França',
			'México',
			'Alemanha'
		],
		hints: [
			'Juan Gris nasceu em Madri.',
			'É o mesmo país de origem de Picasso.'
		],
		tags: ['cubismo', 'artistas', 'juan-gris']
	},
	{
		id: 'q-023',
		segment: 4,
		prizeValue: 1000000,
		category: 'Cubismo',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Qual artista desenvolveu o "Cubismo Órfico" (Orfismo), vertente que priorizava a cor pura e o ritmo visual em detrimento da fragmentação de formas?'
		},
		options: [
			'Robert Delaunay',
			'Fernand Léger',
			'Juan Gris',
			'Jean Metzinger'
		],
		hints: [
			'O artista está ligado ao Orfismo e ao uso intenso da cor.',
			'Sua parceira Sonia também é um nome importante desse núcleo.'
		],
		tags: ['cubismo', 'orfismo', 'vertentes']
	},

	// ── Segmento 5 — Cubismo (intermediário a difícil) ────────────────────────

	{
		id: 'q-024',
		segment: 5,
		prizeValue: 2000000,
		category: 'Cubismo',
		difficulty: 'medium',
		prompt: {
			kind: 'text',
			value: 'Em qual grande salão parisiense de 1911 o Cubismo ganhou visibilidade internacional pela primeira vez em uma exposição coletiva?'
		},
		options: [
			'Salon des Indépendants',
			'Salon d\'Automne',
			'Armory Show',
			'Salon de la Société Nationale'
		],
		hints: [
			'É um salão parisiense conhecido por abrir espaço para vanguardas.',
			'O nome em francês remete a artistas independentes.'
		],
		tags: ['cubismo', 'história', 'exposições']
	},
	{
		id: 'q-025',
		segment: 5,
		prizeValue: 3000000,
		category: 'Cubismo',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Quem co-escreveu "Du Cubisme", o principal manifesto teórico do movimento, publicado em 1912?'
		},
		options: [
			'Albert Gleizes e Jean Metzinger',
			'Pablo Picasso e Georges Braque',
			'Guillaume Apollinaire e Max Jacob',
			'Fernand Léger e Robert Delaunay'
		],
		hints: [
			'A resposta traz dois teóricos que publicaram um livro conjunto em 1912.',
			'Os sobrenomes começam com G e M.'
		],
		tags: ['cubismo', 'manifesto', 'teoria']
	},
	{
		id: 'q-026',
		segment: 5,
		prizeValue: 4000000,
		category: 'Cubismo',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'O estilo particular de Fernand Léger dentro do Cubismo ficou conhecido por qual apelido, em razão do uso recorrente de formas tubulares e cilíndricas?'
		},
		options: [
			'Tubismo',
			'Purismo',
			'Orfismo',
			'Vorticismo'
		],
		hints: [
			'O apelido remete a formas cilíndricas.',
			'Pode ter algo a ver com ondas.'
		],
		tags: ['cubismo', 'léger', 'vertentes']
	},
	{
		id: 'q-027',
		segment: 5,
		prizeValue: 4500000,
		category: 'Cubismo',
		difficulty: 'hard',
		prompt: {
			kind: 'text',
			value: 'Qual pintura de Georges Braque, executada por volta de 1911–1912, é considerada um marco do Cubismo Analítico e foi uma das primeiras obras cubistas a incorporar letras tipográficas como elemento visual?'
		},
		options: [
			'O Português (Le Portugais)',
			'Casas em l\'Estaque',
			'Violino e Cântaro',
			'Natureza-Morta com Violino'
		],
		hints: [
			'É uma obra de Braque do período analítico com letras na composição.',
			'O título menciona uma nacionalidade.'
		],
		tags: ['cubismo', 'braque', 'obras', 'cubismo-analítico']
	},
	{
		id: 'q-028',
		segment: 1,
		prizeValue: 2000,
		category: 'Cubismo',
		difficulty: 'easy',
		prompt: {
			kind: 'text',
			value: 'Ao descrever as telas de Braque numa exposição de 1908, o crítico Louis Vauxcelles usou qual palavra que, de forma acidental, acabou batizando todo o movimento?'
		},
		options: [
			'Cubes (cubos)',
			'Formes (formas)',
			'Plans (planos)',
			'Blocs (blocos)'
		],
		hints: [
			'A palavra descrevia formas geométricas vistas na crítica.',
			'Esse termo acabou originando o nome do movimento.'
		],
		tags: ['cubismo', 'história', 'crítica']
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
