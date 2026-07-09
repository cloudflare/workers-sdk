import { ms } from "itty-time";
import { DelayFunctionError } from "./retries";
import type {
	WorkflowDelayDuration,
	WorkflowDelayFunction,
	WorkflowDynamicDelayContext,
} from "cloudflare:workers";

export const DEFAULT_RETRY_DELAY_MS = 1000;

export const DELAY_FUNCTION_TIMEOUT_MS = ms("5 seconds");

type DelayLogger = {
	warn(...msgs: unknown[]): void;
	debug(...msgs: unknown[]): void;
};

type Waiter = (ms: number, opts?: { signal?: AbortSignal }) => Promise<void>;

export async function invokeDelayFunction(
	delay: WorkflowDelayFunction,
	input: WorkflowDynamicDelayContext,
	options: {
		timeoutMs: number;
		wait: Waiter;
		signal?: AbortSignal;
		logger?: DelayLogger;
	}
): Promise<WorkflowDelayDuration> {
	const { wait, signal, logger } = options;
	const logFields = { step: input.ctx.step.name, attempt: input.ctx.attempt };

	const settled = new AbortController();
	const timeoutSignal = signal
		? AbortSignal.any([signal, settled.signal])
		: settled.signal;

	type Raced =
		| { timedOut: true }
		| { timedOut: false; value: WorkflowDelayDuration };

	try {
		const result = await Promise.race<Raced>([
			Promise.resolve(delay(input)).then((value) => ({
				timedOut: false,
				value,
			})),
			wait(options.timeoutMs, { signal: timeoutSignal })
				.then((): Raced => ({ timedOut: true }))
				.catch((): Raced => ({ timedOut: true })),
		]);
		if (result.timedOut) {
			if (signal?.aborted) {
				logger?.debug(
					"delay function aborted by engine shutdown; using default delay",
					logFields
				);
				return DEFAULT_RETRY_DELAY_MS;
			}
			logger?.warn(
				`delay function did not resolve within ${options.timeoutMs}ms`,
				logFields
			);
			throw new DelayFunctionError(
				`did not return within ${options.timeoutMs / 1000} seconds`
			);
		}
		return result.value;
	} catch (e) {
		if (e instanceof DelayFunctionError) {
			throw e;
		}
		const message = e instanceof Error ? e.message : String(e);
		logger?.warn("delay function threw", { ...logFields, error: message });
		throw new DelayFunctionError(`threw an error: ${message}`);
	} finally {
		settled.abort();
	}
}
