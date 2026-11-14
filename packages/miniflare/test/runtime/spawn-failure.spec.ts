import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { setImmediate as flush } from "node:timers/promises";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { DeferredPromise, Miniflare, Runtime } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest } from "../test-shared";

test("Runtime: failed spawn waits for close without waiting for exit", async ({
	expect,
	onTestFinished,
}) => {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const control = new PassThrough();
	const kill = vi.fn(() => true);
	const child = Object.assign(new childProcess.ChildProcess(), {
		stdin,
		stdout,
		stderr,
		stdio: [stdin, stdout, stderr, control],
		kill,
	});
	const cause = Object.assign(new Error("spawn workerd EACCES"), {
		code: "EACCES",
		errno: -13,
	});
	const errorEmitted = new DeferredPromise<void>();
	// Observe the error without settling readiness, as an application's logger might.
	child.on("error", () => errorEmitted.resolve());
	const spawn = vi.spyOn(childProcess, "spawn").mockImplementation(() => {
		queueMicrotask(() => child.emit("error", cause));
		return child;
	});
	onTestFinished(() => {
		for (const stream of child.stdio) {
			stream.destroy();
		}
		child.emit("close", -13, null);
		spawn.mockRestore();
	});
	const runtime = new Runtime();
	let settled = false;
	const startup = runtime
		.updateConfig(
			Buffer.alloc(0),
			{
				entryAddress: "127.0.0.1:8787",
				loopbackAddress: "127.0.0.1:1234",
				requiredSockets: ["entry"],
			},
			[],
			new AbortController().signal
		)
		.catch((error: unknown) => {
			settled = true;
			return error;
		});
	await errorEmitted;
	await flush();
	expect(child.stdio.every((stream) => stream?.destroyed === true)).toBe(true);
	expect(settled).toBe(false);
	expect(child.pid).toBeUndefined();
	let disposed = false;
	const disposal = Promise.resolve(runtime.dispose()).then(() => {
		disposed = true;
	});
	await flush();
	expect(disposed).toBe(false);
	child.emit("close", -13, null);
	await expect(startup).resolves.toMatchObject({
		code: "WORKERD_SPAWN_FAILED",
		message: "WORKERD_SPAWN_FAILED: EACCES",
		cause,
	});
	await disposal;
	expect(kill).not.toHaveBeenCalled();
});

for (const code of ["ENOENT", "EACCES"]) {
	test.skipIf(code === "EACCES" && process.platform === "win32")(
		`Miniflare: ${code} spawning workerd rejects readiness and permits cleanup`,
		async ({ expect, onTestFinished }) => {
			const directory = await fs.mkdtemp(
				path.join(os.tmpdir(), "miniflare-spawn-refusal-")
			);
			onTestFinished(() => removeDir(directory));
			const executable = path.join(directory, "workerd");
			if (code === "EACCES") {
				await fs.writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o600 });
				await fs.chmod(executable, 0o600);
			}
			vi.stubEnv("MINIFLARE_WORKERD_PATH", executable);
			onTestFinished(() => {
				vi.unstubAllEnvs();
			});
			const spawn = vi.spyOn(childProcess, "spawn");
			const createServer = vi.spyOn(http, "createServer");
			onTestFinished(() => {
				spawn.mockRestore();
				createServer.mockRestore();
			});
			const mf = new Miniflare({
				enableDevRegistry: false,
				workers: [
					{
						config: {
							name: "spawn-refusal",
							compatibilityDate: "2026-10-01",
							manifest: singleModuleManifest(
								'export default { fetch() { return new Response("unused"); } };'
							),
						},
					},
				],
			});
			onTestFinished(() => mf.dispose().catch(() => {}));
			const startupError = await mf.ready.catch((error: unknown) => error);
			expect(startupError).toMatchObject({
				code: "WORKERD_SPAWN_FAILED",
				message: `WORKERD_SPAWN_FAILED: ${code}`,
				cause: { code },
			});
			expect(spawn).toHaveBeenCalledOnce();
			const child = spawn.mock.results[0].value;
			assert(child instanceof childProcess.ChildProcess);
			expect(child.pid).toBeUndefined();
			expect(child.stdio.every((stream) => stream?.destroyed ?? true)).toBe(
				true
			);
			await expect(mf.dispose()).rejects.toBe(startupError);
			expect(createServer).toHaveBeenCalled();
			for (const result of createServer.mock.results) {
				assert(result.value instanceof http.Server);
				expect(result.value.listening).toBe(false);
			}
		}
	);
}
