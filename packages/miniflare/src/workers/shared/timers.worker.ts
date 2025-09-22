import assert from "node:assert";
import { Awaitable } from "./types";

const kFakeTimerHandle = Symbol("kFakeTimerHandle");
export type TimerHandle = number | { [kFakeTimerHandle]: number };

interface FakeTimeout {
	triggerTimestamp: number;
	closure: () => Awaitable<unknown>;
}

export class Timers {
	// Fake unix time in milliseconds. If defined, fake timers will be enabled.
	#fakeTimestamp?: number;

	#fakeNextTimerHandle = 0;
	#fakePendingTimeouts = new Map<number, FakeTimeout>();
	#fakeRunningTasks = new Set<Promise<unknown>>();

	// Timers API

	now = () => this.#fakeTimestamp ?? Date.now();

	setTimeout<Args extends any[]>(
		closure: (...args: Args) => Awaitable<unknown>,
		delay: number,
		...args: Args
	): TimerHandle {
		if (this.#fakeTimestamp === undefined) {
			return setTimeout(closure, delay, ...args) as unknown as TimerHandle;
		}

		const handle = this.#fakeNextTimerHandle++;
		const argsClosure = () => closure(...args);
		if (delay === 0) {
			this.queueMicrotask(argsClosure);
		} else {
			const timeout: FakeTimeout = {
				triggerTimestamp: this.#fakeTimestamp + delay,
				closure: argsClosure,
			};
			this.#fakePendingTimeouts.set(handle, timeout);
		}
		return { [kFakeTimerHandle]: handle };
	}

	clearTimeout(handle: TimerHandle): void {
		if (typeof handle === "number") return clearTimeout(handle);
		else this.#fakePendingTimeouts.delete(handle[kFakeTimerHandle]);
	}

	queueMicrotask(closure: () => Awaitable<unknown>): void {
		if (this.#fakeTimestamp === undefined) return queueMicrotask(closure);

		const result = closure();
		if (result instanceof Promise) {
			this.#fakeRunningTasks.add(result);
			result.finally(() => this.#fakeRunningTasks.delete(result));
		}
	}

	// Fake Timers Control API

	#runPendingTimeouts() {
		if (this.#fakeTimestamp === undefined) return;
		for (const [handle, timeout] of this.#fakePendingTimeouts) {
			if (timeout.triggerTimestamp <= this.#fakeTimestamp) {
				this.#fakePendingTimeouts.delete(handle);
				this.queueMicrotask(timeout.closure);
			}
		}
	}

	enableFakeTimers(timestamp: number) {
		this.#fakeTimestamp = timestamp;
		this.#runPendingTimeouts();
	}
	disableFakeTimers() {
		this.#fakeTimestamp = undefined;
		this.#fakePendingTimeouts.clear();
	}
	advanceFakeTime(delta: number) {
		assert(
			this.#fakeTimestamp !== undefined,
			"Expected fake timers to be enabled before `advanceFakeTime()` call"
		);
		this.#fakeTimestamp += delta;
		this.#runPendingTimeouts();
	}

	async waitForFakeTasks() {
		while (this.#fakeRunningTasks.size > 0) {
			await Promise.all(this.#fakeRunningTasks);
		}
	}
}
