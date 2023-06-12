import { setTimeout } from "node:timers/promises";

export async function retry(
	promise: () => Promise<unknown>,
	n = 20
): Promise<void> {
	if (n === 0) {
		await promise();
	} else {
		try {
			await promise();
		} catch {
			await setTimeout(2_000);
			return retry(promise, n - 1);
		}
	}
}
