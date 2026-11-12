import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { Miniflare, MiniflareCoreError, Runtime } from "miniflare";
import { test, vi } from "vitest";
import { useTmp } from "../test-shared";

/** Simulates workerd exiting after emitting the given stderr chunks. */
function mockRuntimeFailure(chunks: string[]) {
	return vi.spyOn(childProcess, "spawn").mockImplementation(() => {
		const stdin = new PassThrough();
		const stdout = new PassThrough();
		const stderr = new PassThrough();
		const control = new PassThrough();
		const process = Object.assign(new childProcess.ChildProcess(), {
			stdin,
			stdout,
			stderr,
			stdio: [stdin, stdout, stderr, control],
			kill: () => true,
		});
		stdin.on("finish", () => {
			// Separate writes give the startup buffer deterministic chunk boundaries.
			for (const chunk of chunks) {
				stderr.write(chunk);
			}
			stderr.end();
			control.end();
			process.emit("exit", 1, null);
		});
		return process;
	});
}

const failures = [
	{
		name: "Rust socket error",
		stderr: 'Socket "entry": bind(): Address already in use (os error 98)\n',
		address: "127.0.0.1:8787",
	},
	{
		name: "structured Rust socket error",
		stderr: `${JSON.stringify({
			timestamp: 1700000000000,
			level: "error",
			message: 'Socket "entry": bind(): Address already in use (os error 48)',
		})}\n`,
		address: "127.0.0.1:8787",
	},
	{
		name: "Windows socket error",
		stderr:
			'Socket "entry": bind(): Only one usage of each socket address (protocol/network address/port) is normally permitted. (os error 10048)\n',
		address: "127.0.0.1:8787",
	},
	{
		name: "C++ fatal bind error",
		stderr:
			"*** Fatal uncaught kj::Exception: rust/cxx/kj-rs-io/ffi.rs:209: failed: bind(): Address already in use (os error 48)\n",
		address: undefined,
	},
	{
		name: "legacy C++ socket error",
		stderr:
			"kj/async-io-unix.c++:1: failed: Address already in use; toString() = [::1]:8787; stack: 7ff6a1b2c3d4\n",
		address: "[::1]:8787",
	},
	{
		name: "socket error after another bind failure",
		stderr:
			'Socket "other": bind(): Permission denied (os error 13)\nSocket "entry": bind(): Address already in use (os error 98)\n',
		address: "127.0.0.1:8787",
	},
];

function startRuntime(runtime: Runtime) {
	return runtime.updateConfig(
		Buffer.alloc(0),
		{
			entryAddress: "127.0.0.1:8787",
			loopbackAddress: "127.0.0.1:1234",
			requiredSockets: ["entry"],
			handleStructuredLogs() {},
		},
		[],
		new AbortController().signal
	);
}

test.for(failures)(
	"diagnoses $name regardless of stderr chunk boundaries",
	async ({ stderr, address }, { expect, onTestFinished }) => {
		const runtime = new Runtime();
		onTestFinished(() => runtime.dispose());
		const chunks: string[] = [];
		const spawn = mockRuntimeFailure(chunks);
		onTestFinished(() => spawn.mockRestore());
		const where = address === undefined ? "" : ` (${address})`;

		// Try every possible split, including splits within a socket name or address.
		for (let split = 0; split <= stderr.length; split++) {
			chunks.splice(
				0,
				chunks.length,
				stderr.slice(0, split),
				stderr.slice(split)
			);
			await expect(startRuntime(runtime)).rejects.toMatchObject({
				code: "ERR_ADDRESS_IN_USE",
				message: `Address already in use${where}. Please check that you are not already running a server on this address or specify a different port with --port.`,
			});
		}
	}
);

test("preserves stderr for other startup failures", async ({
	expect,
	onTestFinished,
}) => {
	const stderr = 'Socket "entry": bind(): Permission denied (os error 13)';
	const spawn = mockRuntimeFailure([
		stderr.slice(0, 20),
		stderr.slice(20),
		"\n",
	]);
	onTestFinished(() => spawn.mockRestore());
	const runtime = new Runtime();
	onTestFinished(() => runtime.dispose());

	await expect(startRuntime(runtime)).rejects.toMatchObject({
		code: "ERR_RUNTIME_FAILURE",
		message: expect.stringContaining(`Runtime stderr:\n${stderr}`),
	});
});

/**
 * Simulates workerd exiting before it reads its config from stdin, as when it
 * crashes at startup on Windows. Writing the config then fails the way it does
 * on Windows, with `write EOF`.
 */
function mockRuntimeExitBeforeConfig(stderrOutput: string) {
	return vi.spyOn(childProcess, "spawn").mockImplementation(() => {
		const stdout = new PassThrough();
		const stderr = new PassThrough();
		const control = new PassThrough();
		const process = Object.assign(new childProcess.ChildProcess(), {
			stdout,
			stderr,
			kill: () => true,
		});
		const stdin = new Writable({
			write(_chunk, _encoding, callback) {
				// workerd has already exited: its end of the pipe is closed.
				setImmediate(() =>
					callback(
						Object.assign(new Error("write EOF"), {
							errno: -4095,
							code: "EOF",
							syscall: "write",
						})
					)
				);
			},
		});
		Object.assign(process, { stdin, stdio: [stdin, stdout, stderr, control] });
		stderr.end(stderrOutput);
		control.end();
		setImmediate(() => process.emit("exit", 1, null));
		return process;
	});
}

// https://github.com/cloudflare/workers-sdk/issues/16441
test("reports a startup failure when workerd exits before reading its config", async ({
	expect,
	onTestFinished,
}) => {
	const stderr =
		"*** Received structured exception #0xe06d7363: (unknown exception code); stack: 7ffe46bd2bdb";
	const spawn = mockRuntimeExitBeforeConfig(`${stderr}\n`);
	onTestFinished(() => spawn.mockRestore());
	const runtime = new Runtime();
	onTestFinished(() => runtime.dispose());

	await expect(startRuntime(runtime)).rejects.toMatchObject({
		code: "ERR_RUNTIME_FAILURE",
		message: expect.stringContaining(`Runtime stderr:\n${stderr}`),
	});
});

// The same, end to end through `new Miniflare()`, with a real process standing
// in for a workerd binary that exits before reading its config. Unix only: the
// stand-in is a shell script.
test.skipIf(process.platform === "win32")(
	"Miniflare: throws ERR_RUNTIME_FAILURE when workerd exits before reading its config",
	{ concurrent: false },
	async ({ expect, onTestFinished }) => {
		const tmp = await useTmp();
		const workerdPath = path.join(tmp, "exiting-workerd.sh");
		await fs.writeFile(
			workerdPath,
			'#!/bin/sh\necho "workerd failed to load" >&2\nexit 1\n',
			{ mode: 0o755 }
		);
		vi.stubEnv("MINIFLARE_WORKERD_PATH", workerdPath);
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});

		const mf = new Miniflare({
			workers: [
				{
					config: { name: "", compatibilityDate: "2025-05-01" },
					legacy: { serviceWorkerScript: "" },
				},
			],
		});
		onTestFinished(() => mf.dispose().catch(() => {}));

		await expect(mf.ready).rejects.toThrow(MiniflareCoreError);
		await expect(mf.ready).rejects.toThrow(/Workers runtime failed to start/);
	}
);
