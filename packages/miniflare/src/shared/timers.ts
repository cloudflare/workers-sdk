import { Awaitable } from "./types";

export interface Timers<TimeoutHandle = unknown> {
	now(): number; // milliseconds
	setTimeout<Args extends any[]>(
		closure: (...args: Args) => Awaitable<unknown>,
		delay: number,
		...args: Args
	): TimeoutHandle;
	clearTimeout(handle: TimeoutHandle): void;
	queueMicrotask(closure: () => Awaitable<unknown>): void;
}

export const defaultTimers: Timers<NodeJS.Timeout> = {
	now: () => Date.now(),
	setTimeout,
	clearTimeout,
	queueMicrotask,
};

// TODO(soon): remove once we remove the old storage system
export type Clock = Timers["now"];
export const defaultClock = defaultTimers.now;

export function millisToSeconds(millis: number): number {
	return Math.floor(millis / 1000);
}

export function secondsToMillis(seconds: number): number {
	return seconds * 1000;
}
