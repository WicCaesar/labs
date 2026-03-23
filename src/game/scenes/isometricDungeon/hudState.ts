import type { DungeonHudState, DungeonLevelId, DungeonState } from './levelConfig';

export type BuildDungeonHudStateParams = {
	state: DungeonState;
	currentLevel: DungeonLevelId;
	isDungeonQuizActive: boolean;
	activeDungeonQuizId: 'blue' | 'yellow' | null;
	lastYellowQuizCorrectAnswers: number;
	blueUnlocked: boolean;
	redUnlocked: boolean;
	nearNpc: boolean;
	nearExit: boolean;
	nearInteractable: boolean;
	canPushFacingBlock: boolean;
	areAllButtonsPressed: boolean;
	buttonCount: number;
	pressedCount: number;
};

export function buildDungeonHudState(params: BuildDungeonHudStateParams): DungeonHudState {
	const {
		state,
		currentLevel,
		isDungeonQuizActive,
		activeDungeonQuizId,
		lastYellowQuizCorrectAnswers,
		blueUnlocked,
		redUnlocked,
		nearNpc,
		nearExit,
		nearInteractable,
		canPushFacingBlock,
		areAllButtonsPressed,
		buttonCount,
		pressedCount
	} = params;

	if (state === 'level-one-hunt-blue') {
		return {
			level: 1,
			state,
			status: 'A masmorra está em escala de cinza. Fale com Jarbas para receber orientações.',
			hint: nearExit
				? 'Pressione ESPAÇO para descer agora para o nível 2.'
				: canPushFacingBlock
					? 'Pressione ESPAÇO para empurrar o bloco à sua frente.'
					: nearNpc
						? 'Pressione ESPAÇO para conversar com Jarbas.'
						: nearInteractable
							? 'Pressione ESPAÇO perto da marcação para inspecioná-la.'
							: 'Encontre o buraco central para descer ou fale com Jarbas antes de seguir.',
			objective: 'Desça para o nível 2. Azul será recuperado no desafio final do nível 4.',
			canInteract: nearNpc || nearExit || nearInteractable || canPushFacingBlock
		};
	}

	if (state === 'level-one-blue-unlocked') {
		return {
			level: 1,
			state,
			status: 'Azul restaurado. O buraco de descida está ativo.',
			hint: nearExit
				? 'Pressione ESPAÇO para descer para o próximo nível.'
				: canPushFacingBlock
					? 'Pressione ESPAÇO para empurrar o bloco à sua frente.'
					: nearInteractable
						? 'Pressione ESPAÇO perto da marcação para inspecioná-la.'
						: 'Encontre o buraco escuro perto do centro da masmorra.',
			objective: 'Desça para o nível 2.',
			canInteract: nearExit || nearInteractable || canPushFacingBlock
		};
	}

	if (state === 'level-two-hunt-red') {
		return {
			level: 2,
			state,
			status: 'O pinguim está hostil agora. Fique em movimento.',
			hint: nearNpc
				? 'Pressione ESPAÇO perto do pinguim inimigo para atacar e derrotá-lo.'
				: canPushFacingBlock
					? 'Pressione ESPAÇO para empurrar o bloco à sua frente e abrir um caminho mais seguro.'
					: nearInteractable
						? 'Pressione ESPAÇO perto da marcação para inspecioná-la enquanto evita o inimigo.'
						: 'Evite o contato. Aproxime-se apenas quando estiver pronto para atacar.',
			objective: 'Derrote o pinguim inimigo para desbloquear vermelho.',
			canInteract: nearNpc || nearInteractable || canPushFacingBlock
		};
	}

	if (state === 'level-two-red-unlocked') {
		return {
			level: 2,
			state,
			status: 'Vermelho restaurado. As próximas escadas estão ativas.',
			hint: nearExit
				? 'Pressione ESPAÇO para descer para o nível 3 e enfrentar o quiz final.'
				: canPushFacingBlock
					? 'Pressione ESPAÇO para empurrar o bloco à sua frente.'
					: nearInteractable
						? 'Pressione ESPAÇO perto da marcação para inspecioná-la.'
						: 'Encontre as escadas marcadas para seguir para o nível 3.',
			objective: 'Chegue ao nível 3 e desbloqueie amarelo (canal verde).',
			canInteract: nearExit || nearInteractable || canPushFacingBlock
		};
	}

	if (state === 'level-three-hunt-yellow') {
		if (isDungeonQuizActive && activeDungeonQuizId === 'yellow') {
			return {
				level: 3,
				state,
				status: 'Quiz final em andamento: responda 3 perguntas do segmento 2 para desbloquear amarelo.',
				hint: 'Complete o quiz usando teclado ou mouse. ESC fecha o quiz.',
				objective: 'Passe no quiz final do segmento 2.',
				canInteract: false
			};
		}

		return {
			level: 3,
			state,
			status: 'Desafio final: fale com o pinguim para desbloquear amarelo.',
			hint: nearNpc
				? 'Pressione ESPAÇO para iniciar um quiz de 3 perguntas do segmento 2. Tire 3/3.'
				: canPushFacingBlock
					? 'Pressione ESPAÇO para empurrar blocos de puzzle e abrir a rota.'
					: nearInteractable
						? 'Pressione ESPAÇO perto da marcação para inspecioná-la.'
						: lastYellowQuizCorrectAnswers > 0
							? `Última pontuação final: ${lastYellowQuizCorrectAnswers}/3. Fale com o pinguim para tentar novamente.`
							: 'Encontre o pinguim e passe no quiz final.',
			objective: 'Desbloqueie amarelo (canal verde) para restaurar RGB completo.',
			canInteract: nearNpc || nearInteractable || canPushFacingBlock
		};
	}

	if (state === 'level-three-yellow-unlocked') {
		return {
			level: 3,
			state,
			status: 'Yellow restored. A deeper descent path is now open.',
			hint: nearExit
				? 'Press SPACE to descend to level 4 and solve the block-button puzzle.'
				: canPushFacingBlock
					? 'Press SPACE to push the block in front of you.'
					: nearInteractable
						? 'Press SPACE near the marker to inspect it.'
						: 'Find the descent marker to continue.',
			objective: 'Descend to level 4.',
			canInteract: nearExit || nearInteractable || canPushFacingBlock
		};
	}

	if (state === 'level-four-button-puzzle') {
		return {
			level: 4,
			state,
			status: 'Final puzzle: press all floor buttons using push blocks.',
			hint: nearExit
				? areAllButtonsPressed
					? 'All buttons are active. Press SPACE at the gate to complete the dungeon.'
					: 'Gate is locked. Activate all buttons first.'
				: canPushFacingBlock
					? 'Press SPACE to push the block in front of you.'
					: nearInteractable
						? 'Press SPACE near the marker to inspect it.'
						: 'Position blocks on every button tile.',
			objective: `Activate all floor buttons (${pressedCount}/${buttonCount}).`,
			canInteract: nearExit || nearInteractable || canPushFacingBlock
		};
	}

	return {
		level: currentLevel,
		state: 'complete',
		status: blueUnlocked && redUnlocked
			? 'Desafio final completo: RGB completo restaurado.'
			: 'Desafio final completo: verde desbloqueado. Recupere azul + vermelho para RGB completo.',
		hint: blueUnlocked && redUnlocked
			? (nearInteractable
				? 'Todos os canais de cor recuperados. Pressione ESPAÇO perto de uma marcação para inspecioná-la.'
				: 'Todos os canais de cor recuperados. Explore livremente.')
			: (nearInteractable
				? 'Verde restaurado. Pressione ESPAÇO perto de uma marcação para inspecioná-la enquanto busca os canais faltantes.'
				: 'Verde restaurado. Volte para desbloquear os canais restantes se necessário.'),
		objective: 'Completo.',
		canInteract: nearInteractable || canPushFacingBlock
	};
}
