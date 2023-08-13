import { setTimeout } from "node:timers/promises";

export async function retry<T>(
	retryIf: (currentState: T) => boolean,
	action: () => Promise<T>,
	n = 30
): Promise<T> {
	const states: T[] = [];
	while (n >= 0) {
		try {
			const currentState = await action();
			if (!retryIf(currentState)) {
				return currentState;
			}
			states.push(currentState);
		} catch {}
		await setTimeout(2_000);
		n--;
	}
	console.error(states);
	throw new Error("Timed out waiting for state to change");
}
