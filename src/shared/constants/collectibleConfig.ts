import type { DungeonLevelId } from '../../game/scenes/isometricDungeon/levelConfig';
import type { LevelCollectibleConfig } from '../types/collectibles';
import { CUBISM_FULL_TEXT, CUBISM_KEYWORDS } from '../../data/themes/cubismLevel';

/**
 * Generate formatted full text with proper placeholders for display
 */
function generateThemeText(baseText: string, keywords: typeof CUBISM_KEYWORDS): string {
	let result = baseText;
	keywords.forEach((keyword, index) => {
		result = result.replace(`[PLACEHOLDER_${index}]`, `[${keyword.originalCase}]`);
	});
	return result;
}

/**
 * Collectible configurations per level.
 * Currently only Level 3 (quiz level) has collectibles.
 */
export const COLLECTIBLE_CONFIGS: Record<DungeonLevelId, LevelCollectibleConfig | null> = {
	1: null,
	2: null,
	3: {
		themeTitle: 'Cubismo',
		fullText: generateThemeText(CUBISM_FULL_TEXT, CUBISM_KEYWORDS),
		keywords: CUBISM_KEYWORDS.map(k => ({
			id: k.id,
			text: k.text,
			originalCase: k.originalCase
		})),
		spawns: [
			// Upper left area
			{
				id: 'collectible-formas',
				text: CUBISM_KEYWORDS[0].text,
				originalCase: CUBISM_KEYWORDS[0].originalCase,
				keywordIndex: 0,
				position: { x: 3, y: 1 },
				collected: false
			},
			// Upper middle
			{
				id: 'collectible-perspectivas',
				text: CUBISM_KEYWORDS[1].text,
				originalCase: CUBISM_KEYWORDS[1].originalCase,
				keywordIndex: 1,
				position: { x: 13, y: 4 },
				collected: false
			},
			// Upper right
			{
				id: 'collectible-angulos',
				text: CUBISM_KEYWORDS[2].text,
				originalCase: CUBISM_KEYWORDS[2].originalCase,
				keywordIndex: 2,
				position: { x: 15, y: 1 },
				collected: false
			},
			// Middle left
			{
				id: 'collectible-estrutura',
				text: CUBISM_KEYWORDS[3].text,
				originalCase: CUBISM_KEYWORDS[3].originalCase,
				keywordIndex: 3,
				position: { x: 8, y: 5 },
				collected: false
			},
			// Middle center
			{
				id: 'collectible-planos',
				text: CUBISM_KEYWORDS[4].text,
				originalCase: CUBISM_KEYWORDS[4].originalCase,
				keywordIndex: 4,
				position: { x: 16, y: 5 },
				collected: false
			},
			// Middle right
			{
				id: 'collectible-fragmentos',
				text: CUBISM_KEYWORDS[5].text,
				originalCase: CUBISM_KEYWORDS[5].originalCase,
				keywordIndex: 5,
				position: { x: 5, y: 9 },
				collected: false
			},
			// Lower left
			{
				id: 'collectible-facetas',
				text: CUBISM_KEYWORDS[6].text,
				originalCase: CUBISM_KEYWORDS[6].originalCase,
				keywordIndex: 6,
				position: { x: 9, y: 11 },
				collected: false
			},
			// Lower right
			{
				id: 'collectible-geometria',
				text: CUBISM_KEYWORDS[7].text,
				originalCase: CUBISM_KEYWORDS[7].originalCase,
				keywordIndex: 7,
				position: { x: 15, y: 11 },
				collected: false
			}
		]
	},
	4: null
};
