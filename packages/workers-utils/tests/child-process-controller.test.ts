import { EventEmitter } from "node:events";
import { afterEach, describe, it, vi } from "vitest";
import { createChildProcessController } from "../src/child-process-controller";
import type { ChildProcess } from "node:child_process";

function createMockProcess(): ChildProcess {
	const child = new EventEmitter() as ChildProcess;
	Object.assign(child, {
		exitCode: null,
		signalCode: null,
		kill: vi.fn(() => true),
	});
	return child;
}

function exit(
	child: ChildProcess,
	code: number | null,
	signal: NodeJS.Signals | null
): void {
	Object.assign(child, { exitCode: code, signalCode: signal });
	child.emit("exit", code, signal);
}

function addedSignalListener(
	signal: "SIGINT" | "SIGTERM",
	before: Set<NodeJS.SignalsListener>
): NodeJS.SignalsListener {
	const listener = process
		.listeners(signal)
		.find((candidate) => !before.has(candidate as NodeJS.SignalsListener));
	if (!listener) {
		throw new Error(`No ${signal} listener was added`);
	}
	return listener as NodeJS.SignalsListener;
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("createChildProcessController", () => {
	it("reports the child process exit", async ({ expect }) => {
		const child = createMockProcess();
		const controller = createChildProcessController(child);

		exit(child, 23, null);

		await expect(controller.exited).resolves.toEqual({
			code: 23,
			signal: null,
		});
	});

	it("reports a child that already exited", async ({ expect }) => {
		const child = createMockProcess();
		Object.assign(child, { exitCode: null, signalCode: "SIGTERM" });

		const controller = createChildProcessController(child);

		await expect(controller.exited).resolves.toEqual({
			code: null,
			signal: "SIGTERM",
		});
		expect(child.listenerCount("exit")).toBe(0);
	});

	it("forwards signals and force kills on a second signal", async ({
		expect,
	}) => {
		const child = createMockProcess();
		const sigintListeners = new Set(process.listeners("SIGINT"));
		const controller = createChildProcessController(child, {
			forwardSignals: true,
		});
		const onSigInt = addedSignalListener("SIGINT", sigintListeners);

		onSigInt("SIGINT");
		onSigInt("SIGINT");

		expect(controller.terminationRequested).toBe(true);
		expect(child.kill).toHaveBeenNthCalledWith(1, "SIGINT");
		expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
		exit(child, null, "SIGKILL");
		await controller.exited;
	});

	it("terminates idempotently and force kills after the deadline", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		const child = createMockProcess();
		const controller = createChildProcessController(child, {
			forceKillAfterMs: 100,
		});

		controller.terminate();
		controller.terminate();
		expect(child.kill).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(100);

		expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
		expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
		exit(child, null, "SIGKILL");
		await controller.exited;
	});

	it("can leave graceful shutdown timing to the child", async ({ expect }) => {
		vi.useFakeTimers();
		const child = createMockProcess();
		const controller = createChildProcessController(child, {
			forceKillAfterMs: null,
		});

		controller.terminate();

		expect(child.kill).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
		exit(child, 0, null);
		await controller.exited;
	});

	it("clears a pending forced-shutdown timer when the child exits", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		const child = createMockProcess();
		const controller = createChildProcessController(child);

		controller.terminate();
		expect(vi.getTimerCount()).toBe(1);
		exit(child, 0, null);
		await controller.exited;

		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects process errors and removes signal listeners", async ({
		expect,
	}) => {
		const child = createMockProcess();
		const sigintCount = process.listenerCount("SIGINT");
		const sigtermCount = process.listenerCount("SIGTERM");
		const controller = createChildProcessController(child, {
			forwardSignals: true,
		});

		child.emit("error", new Error("spawn failed"));

		await expect(controller.exited).rejects.toThrow("spawn failed");
		expect(process.listenerCount("SIGINT")).toBe(sigintCount);
		expect(process.listenerCount("SIGTERM")).toBe(sigtermCount);
		expect(child.listenerCount("exit")).toBe(0);
	});
});
