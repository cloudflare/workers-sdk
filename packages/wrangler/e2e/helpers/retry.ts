import { setTimeout } from "node:timers/promises";

type MaybePromise<T> = T | Promise<T>;

export async function retry<T>(
	retryIf: (currentState: T) => boolean,
	action: () => MaybePromise<T>,
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
		await setTimeout(800);
		n--;
	}
	console.error(states);
	throw new Error("Timed out waiting for state to change");
}
