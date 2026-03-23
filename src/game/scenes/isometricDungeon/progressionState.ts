import type { WorldColorFilterMode } from '../../../shared/events/EventBus';
import { DUNGEON_LEVEL, type DungeonLevelId, type DungeonState } from './levelConfig';

export function resolveStateForLevelLoad(params: {
	levelId: DungeonLevelId;
	blueUnlocked: boolean;
	redUnlocked: boolean;
	yellowUnlocked: boolean;
}): DungeonState {
	const { levelId, blueUnlocked, redUnlocked, yellowUnlocked } = params;

	if (levelId === DUNGEON_LEVEL.ONE) {
		return blueUnlocked ? 'level-one-blue-unlocked' : 'level-one-hunt-blue';
	}

	if (levelId === DUNGEON_LEVEL.TWO) {
		return redUnlocked ? 'level-two-red-unlocked' : 'level-two-hunt-red';
	}

	if (levelId === DUNGEON_LEVEL.THREE) {
		return yellowUnlocked ? 'level-three-yellow-unlocked' : 'level-three-hunt-yellow';
	}

	return 'level-four-button-puzzle';
}

export function resolveExitAvailableForLevel(params: {
	levelId: DungeonLevelId;
	redUnlocked: boolean;
	yellowUnlocked: boolean;
	allButtonsPressed: boolean;
}): boolean {
	const { levelId, redUnlocked, yellowUnlocked, allButtonsPressed } = params;

	return (
		(levelId === DUNGEON_LEVEL.ONE)
		|| (levelId === DUNGEON_LEVEL.TWO && redUnlocked)
		|| (levelId === DUNGEON_LEVEL.THREE && yellowUnlocked)
		|| (levelId === DUNGEON_LEVEL.FOUR && allButtonsPressed)
	);
}

export function resolveWorldColorFilterMode(params: {
	redUnlocked: boolean;
	yellowUnlocked: boolean;
	blueUnlocked: boolean;
	currentLevel: DungeonLevelId;
}): WorldColorFilterMode {
	const { redUnlocked, yellowUnlocked, blueUnlocked, currentLevel } = params;
	const red = redUnlocked;
	const green = yellowUnlocked;
	const blue = blueUnlocked;

	if (red && green && blue) {
		return 'none';
	}

	if (red && green) {
		return 'red-green-unlocked';
	}

	if (red && blue) {
		return 'red-blue-unlocked';
	}

	if (green && blue) {
		return 'green-blue-unlocked';
	}

	if (red) {
		return 'red-unlocked';
	}

	if (green) {
		return 'green-unlocked';
	}

	if (blue) {
		return 'blue-unlocked';
	}

	if (currentLevel === DUNGEON_LEVEL.TWO) {
		return 'red-unlocked';
	}

	return 'grayscale';
}
