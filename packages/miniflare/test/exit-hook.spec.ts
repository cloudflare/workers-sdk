import { afterEach, test } from "vitest";
import { exitHook } from "../src/exit-hook";

// The handlers call `process.exit()`, so these tests assert on listener
// registration rather than invoking the handlers directly.
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

const unregisters: (() => void)[] = [];

function register(callback: () => void = () => {}) {
	const unregister = exitHook(callback);
	unregisters.push(unregister);
	return unregister;
}

afterEach(() => {
	while (unregisters.length > 0) {
		unregisters.pop()?.();
	}
});

test("exitHook: listens for SIGHUP so the runtime is disposed on hangup", ({
	expect,
}) => {
	const before = process.listenerCount("SIGHUP");
	register();
	expect(process.listenerCount("SIGHUP")).toBe(before + 1);
});

test("exitHook: registers a listener for every termination signal", ({
	expect,
}) => {
	const before = Object.fromEntries(
		SIGNALS.map((signal) => [signal, process.listenerCount(signal)])
	);

	register();

	for (const signal of SIGNALS) {
		expect(process.listenerCount(signal)).toBe(before[signal] + 1);
	}
});

test("exitHook: removes every signal listener once the last callback unregisters", ({
	expect,
}) => {
	const before = Object.fromEntries(
		SIGNALS.map((signal) => [signal, process.listenerCount(signal)])
	);

	const unregisterFirst = register();
	const unregisterSecond = register();

	unregisterFirst();
	// Listeners stay while another callback is still registered.
	for (const signal of SIGNALS) {
		expect(process.listenerCount(signal)).toBe(before[signal] + 1);
	}

	unregisterSecond();
	for (const signal of SIGNALS) {
		expect(process.listenerCount(signal)).toBe(before[signal]);
	}
});
