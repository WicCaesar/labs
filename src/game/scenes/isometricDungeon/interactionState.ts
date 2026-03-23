import type { DungeonState } from './levelConfig';

export type DungeonInteractionAction =
	| 'transition-to-second'
	| 'transition-to-third'
	| 'transition-to-fourth'
	| 'start-npc-dialogue'
	| 'kill-enemy-unlock-red'
	| 'start-yellow-quiz'
	| 'complete-fourth-level'
	| 'emit-gate-locked'
	| 'activate-nearby-interactable';

export type ResolveDungeonInteractionParams = {
	state: DungeonState;
	redUnlocked: boolean;
	nearExit: boolean;
	nearNpc: boolean;
	allButtonsPressed: boolean;
};

// Converts state + proximity flags into a single action.
// Scene methods execute the action so the transition side effects stay centralized in the scene.
export function resolveDungeonInteractionAction(
	params: ResolveDungeonInteractionParams
): DungeonInteractionAction {
	const { state, redUnlocked, nearExit, nearNpc, allButtonsPressed } = params;

	if (state === 'level-one-hunt-blue') {
		if (nearExit) {
			return 'transition-to-second';
		}
		if (nearNpc) {
			return 'start-npc-dialogue';
		}
		return 'activate-nearby-interactable';
	}

	if (state === 'level-one-blue-unlocked') {
		if (nearExit) {
			return 'transition-to-second';
		}
		return 'activate-nearby-interactable';
	}

	if (state === 'level-two-hunt-red' && !redUnlocked) {
		if (nearNpc) {
			return 'kill-enemy-unlock-red';
		}
		return 'activate-nearby-interactable';
	}

	if (state === 'level-two-red-unlocked') {
		if (nearExit) {
			return 'transition-to-third';
		}
		return 'activate-nearby-interactable';
	}

	if (state === 'level-three-hunt-yellow') {
		if (nearNpc) {
			return 'start-npc-dialogue';
		}
		return 'activate-nearby-interactable';
	}

	if (state === 'level-three-yellow-unlocked') {
		if (nearNpc) {
			return 'start-npc-dialogue';
		}

		if (nearExit) {
			return 'transition-to-fourth';
		}
		return 'activate-nearby-interactable';
	}

	if (state === 'level-four-button-puzzle') {
		if (nearNpc) {
			return 'start-npc-dialogue';
		}

		if (nearExit) {
			return allButtonsPressed ? 'complete-fourth-level' : 'emit-gate-locked';
		}
		return 'activate-nearby-interactable';
	}

	if (state === 'complete') {
		if (nearNpc) {
			return 'start-npc-dialogue';
		}

		return 'activate-nearby-interactable';
	}

	return 'activate-nearby-interactable';
}
