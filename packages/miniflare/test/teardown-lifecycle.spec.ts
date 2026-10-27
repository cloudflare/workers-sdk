import assert from "node:assert";
import childProcess from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { text } from "node:stream/consumers";
import { removeDirSync } from "@cloudflare/workers-utils/fs-helpers";
import { Miniflare, ProxyClient } from "miniflare";
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

test("Miniflare: dispose waits for workerd exit and continues cleanup before returning proxy cleanup failure", async ({
	expect,
}) => {
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

		releaseRuntimeExit();
		runtimeExitReleased = true;
		const firstDisposeError = await firstDisposeResult;
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

test("Miniflare: dispose removes its temporary directory before resolving", async ({
	expect,
}) => {
	const mf = await createReadyMiniflare();

	// `Miniflare` keeps local storage (D1, KV, R2, cache, Durable Objects,
	// e-mail, etc.) in a `miniflare-<hex>` directory under `os.tmpdir()`, and
	// `dispose()` should only resolve once that directory has been removed: a
	// process exiting immediately after `dispose()` resolves (a test runner
	// worker, or a script calling `process.exit()`) must not be able to cut
	// the removal short and leave the directory behind on disk.
	const originalRm = fs.promises.rm;
	let blockedTmpPath: string | undefined;
	let releaseBlockedRm!: () => void;
	const blockedRm = new Promise<void>((resolve) => {
		releaseBlockedRm = resolve;
	});
	const rm = vi
		.spyOn(fs.promises, "rm")
		.mockImplementation((target, options) => {
			const targetPath = target.toString();
			if (
				blockedTmpPath === undefined &&
				path.dirname(targetPath) === os.tmpdir() &&
				/^miniflare-[0-9a-f]{32}$/.test(path.basename(targetPath))
			) {
				blockedTmpPath = targetPath;
				// Hold the removal up until the test releases it, so we can tell
				// whether `dispose()` waits for the removal to complete.
				return blockedRm.then(() => originalRm(target, options));
			}
			return originalRm(target, options);
		});

	const disposeResult = mf.dispose();

	try {
		// Wait until `dispose()` reaches the temporary directory removal.
		const pollDeadline = Date.now() + 10_000;
		while (blockedTmpPath === undefined && Date.now() < pollDeadline) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		const tmpPath = blockedTmpPath;
		expect(tmpPath).toBeDefined();
		// `expect()` does not narrow the type for TypeScript:
		assert(tmpPath !== undefined);

		// While the removal is still in flight, `dispose()` must not settle.
		const earlyOutcome = await Promise.race([
			disposeResult.then(
				() => "settled" as const,
				() => "settled" as const
			),
			new Promise<"still-pending">((resolve) => {
				setTimeout(() => resolve("still-pending"), 1_000);
			}),
		]);
		expect(earlyOutcome).toBe("still-pending");

		// Once the removal is released, `dispose()` should resolve, and the
		// temporary directory should actually be gone.
		releaseBlockedRm();
		await disposeResult;
		expect(fs.existsSync(tmpPath)).toBe(false);
	} finally {
		releaseBlockedRm();
		rm.mockRestore();
		await disposeResult.catch(() => {});
	}
}, 60_000);

test("Miniflare: no temporary directory is left behind when the process exits immediately after dispose()", async ({
	expect,
}) => {
	const miniflarePath = require.resolve("miniflare");
	// Give the child process its own private temporary directory, so we can
	// check exactly what it leaves behind, without interference from this
	// process or other tests running in parallel.
	const childTmpRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "miniflare-tmpdir-test-")
	);
	try {
		const result = childProcess.spawn(
			process.execPath,
			[
				"--no-warnings", // Hide experimental warnings
				"-e",
				`
				const { Miniflare } = require(${JSON.stringify(miniflarePath)});
				const mf = new Miniflare({
					workers: [
						{
							config: {
								name: "",
								compatibilityDate: "2025-05-01",
								manifest: {
									mainModule: "index.mjs",
									modules: {
										"index.mjs": {
											type: "esm",
											contents: "export default { fetch() { return new Response('ok'); } }",
										},
									},
								},
								env: { DB: { type: "d1", id: "db" } },
							},
						},
					],
				});
				(async () => {
					await mf.ready;
					await (await mf.getD1Database("DB")).exec("CREATE TABLE t (v TEXT)");
					await mf.dispose();
					// Exit immediately, like a test runner worker or a script that
					// calls process.exit() once its work is done.
					process.exit(0);
				})().catch((error) => {
					console.error(error);
					process.exit(1);
				});
				`,
			],
			{
				stdio: [/* in */ "ignore", /* out */ "pipe", /* error */ "pipe"],
				env: {
					...process.env,
					TMPDIR: childTmpRoot,
					TMP: childTmpRoot,
					TEMP: childTmpRoot,
				},
			}
		);
		assert(result.stderr !== null);
		const stderr = text(result.stderr);
		const [exitCode] = await once(result, "close");
		// No `miniflare-<hex>` directory (containing the D1 database's SQLite
		// files, etc.) should remain in the child's temporary directory.
		expect(exitCode, await stderr).toBe(0);
		expect(fs.readdirSync(childTmpRoot)).toEqual([]);
	} finally {
		removeDirSync(childTmpRoot);
	}
}, 60_000);
