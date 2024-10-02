import { WorkflowSleepDuration } from "cloudflare:workers";
import { ms } from "itty-time";
import type { Engine } from "../engine";

export const ENGINE_TIMEOUT = ms("5 minutes" satisfies WorkflowSleepDuration);

let latestGracePeriodTimestamp: number | undefined = undefined;

export type GracePeriodCallback = (engine: Engine, timeoutMs: number) => void;

export class GracePeriodSemaphore {
	#counter: number = 0;
	readonly callback: GracePeriodCallback;
	readonly timeoutMs: number;

	constructor(callback: GracePeriodCallback, timeoutMs: number) {
		this.callback = callback;
		this.timeoutMs = timeoutMs;
	}

	// acquire takes engine to be the same as release
	async acquire(_engine: Engine) {
		// when the counter goes from 0 to 1 - we can safely reject the previous grace period
		if (this.#counter == 0) {
			latestGracePeriodTimestamp = undefined;
		}
		this.#counter += 1;
	}

	async release(engine: Engine) {
		this.#counter = Math.max(this.#counter - 1, 0);
		if (this.#counter == 0) {
			// Trigger timeout promise, no need to await here,
			// this can be triggered slightly after it's not time sensitive
			this.callback(engine, this.timeoutMs);
		}
	}

	isRunningStep() {
		return this.#counter > 0;
	}
}

export const startGracePeriod: GracePeriodCallback = async (
	engine: Engine,
	timeoutMs: number
) => {
	const gracePeriodHandler = async () => {
		const thisTimestamp = new Date().valueOf();

		// TODO: Should the grace period be 5 mins every time or 5 mins across lifetimes?
		// At the moment, it looks like this will reset to 5 mins if a metal crashes
		// There might possibly waste memory waiting for `timeoutMs` every time
		// We should eventually strongly persist and respect this value across lifetimes

		// We are starting a new grace period
		// 1. There should not be one already set
		// 2. Or if there is, it should be in the past
		if (
			!(
				latestGracePeriodTimestamp === undefined ||
				latestGracePeriodTimestamp < thisTimestamp
			)
		) {
			throw new Error(
				"Can't start grace period since there is already an active one started on " +
					latestGracePeriodTimestamp
			);
		}

		latestGracePeriodTimestamp = thisTimestamp;
		await scheduler.wait(timeoutMs);
		if (
			thisTimestamp !== latestGracePeriodTimestamp ||
			engine.timeoutHandler.isRunningStep()
		) {
			return;
		}
		// priorityQueue is set before the user code runs which implies that a grace period cannot start
		// before init finishes where it is set

		// Ensure next alarm is set before we abort
		await engine.priorityQueue!.handleNextAlarm();
		await engine.abort("Grace period complete");
	};
	void gracePeriodHandler();
};
