export type Help2CardValue = 0 | 1 | 2 | 3;

export type Help2Card = {
	id: string;
	value: Help2CardValue;
};

export const HELP2_CARD_META: Record<Help2CardValue, { title: string; suit: string; removed: number }> = {
	0: { title: 'Rei', suit: '♣', removed: 0 },
	1: { title: 'Ás', suit: '♠', removed: 1 },
	2: { title: 'Dois', suit: '♦', removed: 2 },
	3: { title: 'Três', suit: '♥', removed: 3 }
};

export const getHelp2CardValues = (optionCount: number): Help2CardValue[] => {
	const values: Help2CardValue[] = [0];

	if (optionCount >= 2) {
		values.push(1);
	}

	if (optionCount >= 3) {
		values.push(2);
	}

	if (optionCount >= 4) {
		values.push(3);
	}

	return values;
};

export const shuffled = <T,>(values: readonly T[]): T[] => {
	const copy = [...values];

	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}

	return copy;
};
