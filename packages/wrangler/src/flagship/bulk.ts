import { JsonFriendlyFatalError, UserError } from "@cloudflare/workers-utils";
import { logger } from "../logger";

export async function runBulk<T>(
	targets: string[],
	action: (target: string) => Promise<T>,
	output: { json: boolean; onSuccess: (value: T, target: string) => void }
): Promise<void> {
	const results: T[] = [];
	const failures: Array<{ target: string; message: string }> = [];
	for (const target of targets) {
		try {
			const value = await action(target);
			results.push(value);
			if (!output.json) {
				output.onSuccess(value, target);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push({ target, message });
		}
	}
	if (failures.length > 0) {
		const details = failures
			.map(({ target, message }) => `  - ${target}: ${message}`)
			.join("\n");
		const message = `Failed to process ${failures.length} of the requested items:\n${details}`;
		if (output.json) {
			throw new JsonFriendlyFatalError(
				JSON.stringify({ error: message, results, failures }),
				{ telemetryMessage: "flagship bulk operation partial failure" }
			);
		}
		throw new UserError(message, {
			telemetryMessage: "flagship bulk operation partial failure",
		});
	}
	if (output.json && results.length > 0) {
		logger.json(targets.length === 1 ? results[0] : results);
	}
}
