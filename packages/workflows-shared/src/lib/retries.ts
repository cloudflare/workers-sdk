import { ms } from "itty-time";
// @ts-ignore
import type { ResolvedStepConfig, StepState } from "shared";

export function calcRetryDuration(
	config: ResolvedStepConfig,
	stepState: StepState
): number {
	const { attemptedCount: attemptCount } = stepState;
	const { retries } = config;

	const delay = ms(retries.delay);

	switch (retries.backoff) {
		case "exponential": {
			return delay * Math.pow(2, attemptCount - 1);
		}
		case "linear": {
			return delay * attemptCount;
		}
		case "constant":
		default: {
			return delay;
		}
	}
}
