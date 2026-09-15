import { afterEach, test, vi } from "vitest";
import { exitHook } from "../src/exit-hook";

const SIGNALS = [
	["SIGINT", 128 + 2],
	["SIGTERM", 128 + 15],
	["SIGHUP", 128 + 1],
] as const;

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

test.for(SIGNALS)(
	"exitHook: runs callbacks and exits on %s",
	([signal, exitCode], { expect }) => {
		const listenersBefore = new Set(process.listeners(signal));
		const callback = vi.fn();
		register(callback);

		const signalHandler = process
			.listeners(signal)
			.find((listener) => !listenersBefore.has(listener));
		if (signalHandler === undefined) {
			throw new Error(`Expected exitHook() to register a ${signal} listener`);
		}

		const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`process.exit(${String(code)})`);
		});
		try {
			expect(() => signalHandler(signal)).toThrow(`process.exit(${exitCode})`);
			expect(callback).toHaveBeenCalledOnce();
			expect(exit).toHaveBeenCalledWith(exitCode);
		} finally {
			exit.mockRestore();
		}
	}
);

test("exitHook: registers a listener for every termination signal", ({
	expect,
}) => {
	const before = Object.fromEntries(
		SIGNALS.map(([signal]) => [signal, process.listenerCount(signal)])
	);

	register();

	for (const [signal] of SIGNALS) {
		expect(process.listenerCount(signal)).toBe(before[signal] + 1);
	}
});

test("exitHook: removes every signal listener once the last callback unregisters", ({
	expect,
}) => {
	const before = Object.fromEntries(
		SIGNALS.map(([signal]) => [signal, process.listenerCount(signal)])
	);

	const unregisterFirst = register();
	const unregisterSecond = register();

	unregisterFirst();
	// Listeners stay while another callback is still registered.
	for (const [signal] of SIGNALS) {
		expect(process.listenerCount(signal)).toBe(before[signal] + 1);
	}

	unregisterSecond();
	for (const [signal] of SIGNALS) {
		expect(process.listenerCount(signal)).toBe(before[signal]);
	}
});
