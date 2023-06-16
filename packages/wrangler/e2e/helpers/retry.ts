import { setTimeout } from "node:timers/promises";

export async function retry<T>(
	originalState: T,
	action: () => Promise<T>,
	n = 20
): Promise<T> {
	while (n >= 0) {
		try {
			const currentState = await action();
			if (currentState !== originalState) {
				return currentState;
			}
		} catch (e) {
			await setTimeout(2_000);
			n--;
		}
	}
	throw new Error("Timed out waiting for state to change");
}
