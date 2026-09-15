import { afterEach, test, vi } from "vitest";
import { terminateRuntimeProcess } from "../../src/runtime/shutdown";
import type { ChildProcess } from "node:child_process";

afterEach(() => {
	vi.useRealTimers();
});

test("forces immediate shutdown for ordinary runtimes", async ({ expect }) => {
	const kill = vi.fn(() => true);
	const runtimeProcess = { kill } as unknown as ChildProcess;

	await terminateRuntimeProcess(runtimeProcess, Promise.resolve(), false);

	expect(kill).toHaveBeenCalledOnce();
	expect(kill).toHaveBeenCalledWith("SIGKILL");
});

test("allows container runtimes to shut down gracefully", async ({
	expect,
}) => {
	vi.useFakeTimers();
	const kill = vi.fn(() => true);
	const runtimeProcess = { kill } as unknown as ChildProcess;

	await terminateRuntimeProcess(runtimeProcess, Promise.resolve(), true);
	await vi.advanceTimersByTimeAsync(5_000);

	expect(kill).toHaveBeenCalledOnce();
	expect(kill).toHaveBeenCalledWith("SIGTERM");
});

test("force kills a container runtime after the grace period", async ({
	expect,
}) => {
	vi.useFakeTimers();
	const kill = vi.fn(() => true);
	const runtimeProcess = { kill } as unknown as ChildProcess;
	let resolveExit: (() => void) | undefined;
	const processExitPromise = new Promise<void>((resolve) => {
		resolveExit = resolve;
	});

	const termination = terminateRuntimeProcess(
		runtimeProcess,
		processExitPromise,
		true
	);
	await vi.advanceTimersByTimeAsync(5_000);

	expect(kill).toHaveBeenNthCalledWith(1, "SIGTERM");
	expect(kill).toHaveBeenNthCalledWith(2, "SIGKILL");
	resolveExit?.();
	await termination;
});
