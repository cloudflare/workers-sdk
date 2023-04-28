import { Awaitable } from "./types";

export interface Timers {
	now(): number; // milliseconds
	queueMicrotask(closure: () => Awaitable<unknown>): void;
	// TODO(soon): `setTimeout`, for Queues batching
}

export const defaultTimers: Timers = {
	now: () => Date.now(),
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
