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

type AbortRaceResult<T> = { aborted: true } | { aborted: false; value: T };

export async function raceAgainstAbort<T>(
	promise: Promise<T>,
	signal: AbortSignal
): Promise<AbortRaceResult<T>> {
	const resultPromise = promise.then(
		(value): AbortRaceResult<T> => ({
			aborted: false,
			value,
		})
	);
	if (signal.aborted) {
		return await Promise.race([
			Promise.resolve<AbortRaceResult<T>>({ aborted: true }),
			resultPromise,
		]);
	}

	let resolveAbort: ((result: AbortRaceResult<T>) => void) | undefined;
	const abortPromise = new Promise<AbortRaceResult<T>>((resolve) => {
		resolveAbort = resolve;
	});
	const onAbort = (): void => resolveAbort?.({ aborted: true });
	signal.addEventListener("abort", onAbort, { once: true });

	if (signal.aborted) {
		onAbort();
	}

	try {
		return await Promise.race([resultPromise, abortPromise]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}

// Signal-aware wrapper around the global `scheduler.wait`. `scheduler.wait`
// can't itself be cancelled, so an aborted signal resolves the returned promise
// early and the dangling timer becomes a no-op.
export async function schedulerWait(
	durationMs: number,
	opts?: { signal?: AbortSignal }
): Promise<void> {
	const signal = opts?.signal;
	if (signal?.aborted) {
		return;
	}
	const waitPromise = scheduler.wait(durationMs);
	if (signal === undefined) {
		await waitPromise;
		return;
	}
	await raceAgainstAbort(waitPromise, signal);
}

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
