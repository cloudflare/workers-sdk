import childProcess from "node:child_process";
import { PassThrough } from "node:stream";
import { Runtime } from "miniflare";
import { test, vi } from "vitest";

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
