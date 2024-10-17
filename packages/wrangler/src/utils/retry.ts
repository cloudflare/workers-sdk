import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout } from "node:timers/promises";

export const alsAttemptCounter = new AsyncLocalStorage<number>();

type BackoffStrategy = (ms: number, initMs: number) => number;

export const ConstantBackoff: BackoffStrategy = (ms) => ms;
export const LinearBackoff: BackoffStrategy = (ms, initMs) => ms + initMs;
export const ExponentialBackoff: BackoffStrategy = (ms) => ms * 2;

interface Backoff {
	ms: number;
	initMs: number;
	strategy: BackoffStrategy;
}

async function retryOnErrorInner<T>(
	action: () => T | Promise<T>,
	maxAttempts: number,
	backoff: Backoff,
	attempt: number
): Promise<T> {
	try {
		return await alsAttemptCounter.run(attempt, action);
	} catch (err) {
		if (attempt >= maxAttempts) {
			throw err;
		}
		await setTimeout(backoff.ms);
		return retryOnErrorInner(
			action,
			maxAttempts,
			{
				...backoff,
				ms: backoff.strategy(backoff.ms, backoff.initMs),
			},
			attempt + 1
		);
	}
}

export async function retryOnError<T>(
	action: () => T | Promise<T>,
	maxAttempts = 3,
	{
		ms = 2_000,
		strategy = ConstantBackoff,
	}: { ms?: number; strategy?: BackoffStrategy } = {}
): Promise<T> {
	return retryOnErrorInner(
		action,
		maxAttempts,
		{ ms, initMs: ms, strategy },
		1
	);
}
