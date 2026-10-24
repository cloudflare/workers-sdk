import childProcess from "node:child_process";
import path from "node:path";
import { Miniflare, ProxyClient, Runtime } from "miniflare";
import { afterEach, test, vi } from "vitest";
import { WebSocketServer } from "ws";
import { singleModuleManifest } from "./test-shared";

async function createReadyMiniflare(): Promise<Miniflare> {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`export default {
						fetch() {
							return new Response("ok");
						}
					}`),
				},
			},
		],
	});
	await mf.ready;
	return mf;
}

function findKilledWorkerd(
	kill: ReturnType<typeof vi.spyOn>
): childProcess.ChildProcess | undefined {
	for (let index = 0; index < kill.mock.calls.length; index++) {
		const [signal] = kill.mock.calls[index];
		const child = kill.mock.contexts[index];
		if (
			signal === "SIGKILL" &&
			child instanceof childProcess.ChildProcess &&
			path.basename(child.spawnfile).toLowerCase().startsWith("workerd")
		) {
			return child;
		}
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

test("Miniflare: dispose requests workerd termination while proxy cleanup is pending", async ({
	expect,
}) => {
	const mf = await createReadyMiniflare();
	let markProxyDisposeStarted!: () => void;
	let releaseProxyDispose!: () => void;
	const proxyDisposeStarted = new Promise<void>((resolve) => {
		markProxyDisposeStarted = resolve;
	});
	const proxyDisposeBlocked = new Promise<void>((resolve) => {
		releaseProxyDispose = resolve;
	});
	const proxyDispose = vi
		.spyOn(ProxyClient.prototype, "dispose")
		.mockImplementationOnce(() => {
			markProxyDisposeStarted();
			return proxyDisposeBlocked;
		});
	const kill = vi.spyOn(childProcess.ChildProcess.prototype, "kill");

	const disposePromise = mf.dispose();
	try {
		await proxyDisposeStarted;
		expect(findKilledWorkerd(kill)).toBeDefined();
	} finally {
		releaseProxyDispose();
		proxyDispose.mockRestore();
		await disposePromise;
	}
});

test("Miniflare: dispose terminates dispatch WebSockets before graceful shutdown", async ({
	expect,
}) => {
	const originalUpdateConfig = Runtime.prototype.updateConfig;
	const updateConfig = vi
		.spyOn(Runtime.prototype, "updateConfig")
		.mockImplementation(function (
			this: Runtime,
			...[config, options, workerNames, abortSignal]: Parameters<
				Runtime["updateConfig"]
			>
		) {
			return originalUpdateConfig.call(
				this,
				config,
				{ ...options, requiresGracefulShutdown: true },
				workerNames,
				abortSignal
			);
		});
	let mf: Miniflare | undefined;
	try {
		mf = new Miniflare({
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(`export default {
							fetch() {
								const pair = new WebSocketPair();
								pair[1].accept();
								return new Response(null, {
									status: 101,
									webSocket: pair[0]
								});
							}
						}`),
					},
				},
			],
		});
		const response = await mf.dispatchFetch("http://localhost", {
			headers: { Upgrade: "websocket" },
		});
		const webSocket = response.webSocket;
		if (webSocket == null) {
			throw new Error("Expected dispatchFetch() to return a WebSocket");
		}
		webSocket.accept();

		const kill = vi.spyOn(childProcess.ChildProcess.prototype, "kill");
		try {
			await mf.dispose();
			const signals = kill.mock.calls.flatMap(([signal], index) => {
				const child = kill.mock.contexts[index];
				return child instanceof childProcess.ChildProcess &&
					path.basename(child.spawnfile).toLowerCase().startsWith("workerd")
					? [signal]
					: [];
			});
			expect(signals).toEqual(["SIGTERM"]);
		} finally {
			kill.mockRestore();
		}
	} finally {
		updateConfig.mockRestore();
		await mf?.dispose().catch(() => {});
	}
});

test("Miniflare: dispose waits for workerd exit and continues cleanup before returning proxy cleanup failure", async ({
	expect,
}) => {
	const signalListenerCount = process.listenerCount("SIGHUP");
	let markRuntimeExitObserved!: () => void;
	let releaseRuntimeExit!: () => void;
	const runtimeExitObserved = new Promise<void>((resolve) => {
		markRuntimeExitObserved = resolve;
	});
	const runtimeExitBlocked = new Promise<void>((resolve) => {
		releaseRuntimeExit = resolve;
	});
	const originalEmit = childProcess.ChildProcess.prototype.emit;
	let interceptedRuntimeExit = false;
	const emit = vi
		.spyOn(childProcess.ChildProcess.prototype, "emit")
		.mockImplementation(function (
			this: childProcess.ChildProcess,
			event: string | symbol,
			...args: unknown[]
		) {
			if (
				!interceptedRuntimeExit &&
				event === "exit" &&
				path.basename(this.spawnfile).toLowerCase().startsWith("workerd")
			) {
				interceptedRuntimeExit = true;
				markRuntimeExitObserved();
				void runtimeExitBlocked.then(() => {
					Reflect.apply(originalEmit, this, [event, ...args]);
				});
				return true;
			}
			return Reflect.apply(originalEmit, this, [event, ...args]) as boolean;
		});
	const mf = await createReadyMiniflare();
	const proxyDispose = vi
		.spyOn(ProxyClient.prototype, "dispose")
		.mockRejectedValueOnce(new Error("injected proxy cleanup failure"));
	const webSocketClose = vi.spyOn(WebSocketServer.prototype, "close");
	const kill = vi.spyOn(childProcess.ChildProcess.prototype, "kill");

	let runtimeExitReleased = false;
	let firstDisposeSettled = false;
	const firstDisposeResult = mf.dispose().then(
		() => {
			firstDisposeSettled = true;
			return undefined;
		},
		(error: unknown) => {
			firstDisposeSettled = true;
			return error;
		}
	);

	try {
		await runtimeExitObserved;
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(firstDisposeSettled).toBe(false);
		expect(findKilledWorkerd(kill)).toBeDefined();
		expect(process.listenerCount("SIGHUP")).toBeGreaterThan(
			signalListenerCount
		);

		releaseRuntimeExit();
		runtimeExitReleased = true;
		const firstDisposeError = await firstDisposeResult;
		expect(process.listenerCount("SIGHUP")).toBe(signalListenerCount);
		expect(webSocketClose).toHaveBeenCalled();
		expect(firstDisposeError).toBeInstanceOf(Error);
		expect((firstDisposeError as Error).message).toContain(
			"injected proxy cleanup failure"
		);
	} finally {
		if (!runtimeExitReleased) {
			releaseRuntimeExit();
		}
		emit.mockRestore();
		proxyDispose.mockRestore();
		webSocketClose.mockRestore();
		await firstDisposeResult;
		await mf.dispose().catch(() => {});
	}
});
