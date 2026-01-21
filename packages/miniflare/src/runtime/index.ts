import assert from "node:assert";
import childProcess, { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Abortable, once } from "node:events";
import path from "node:path";
import rl from "node:readline";
import { Readable, Transform } from "node:stream";
import { $ as $colors, red } from "kleur/colors";
import workerdPath, {
	compatibilityDate as supportedCompatibilityDate,
} from "workerd";
import { z } from "zod";
import { SERVICE_LOOPBACK, SOCKET_ENTRY } from "../plugins";
import { MiniflareCoreError } from "../shared";
import { Awaitable } from "../workers";
import {
	handleStructuredLogsFromStream,
	StructuredLogsHandler,
} from "./structured-logs";

const ControlMessageSchema = z.discriminatedUnion("event", [
	z.object({
		event: z.literal("listen"),
		socket: z.string(),
		port: z.number(),
	}),
	z.object({
		event: z.literal("listen-inspector"),
		port: z.number(),
	}),
]);

export const kInspectorSocket = Symbol("kInspectorSocket");
export type SocketIdentifier = string | typeof kInspectorSocket;
export type SocketPorts = Map<SocketIdentifier, number /* port */>;

export type { StructuredLogsHandler } from "./structured-logs";

export interface RuntimeOptions {
	entryAddress: string;
	loopbackAddress: string;
	requiredSockets: SocketIdentifier[];
	inspectorAddress?: string;
	verbose?: boolean;
	handleRuntimeStdio?: (stdout: Readable, stderr: Readable) => void;
	handleStructuredLogs?: StructuredLogsHandler;
}

async function waitForPorts(
	stream: Readable,
	options: Abortable & Pick<RuntimeOptions, "requiredSockets">
): Promise<SocketPorts | undefined> {
	if (options?.signal?.aborted) return;
	const lines = rl.createInterface(stream);
	// Calling `close()` will end the async iterator below and return undefined
	const abortListener = () => lines.close();
	options?.signal?.addEventListener("abort", abortListener, { once: true });
	// We're going to be mutating `sockets`, so shallow copy it
	const requiredSockets = Array.from(options.requiredSockets);
	const socketPorts = new Map<SocketIdentifier, number>();
	try {
		for await (const line of lines) {
			const message = ControlMessageSchema.safeParse(JSON.parse(line));
			// If this was an unrecognised control message, ignore it
			if (!message.success) continue;
			const data = message.data;
			const socket: SocketIdentifier =
				data.event === "listen-inspector" ? kInspectorSocket : data.socket;
			const index = requiredSockets.indexOf(socket);
			// If this wasn't a required socket, ignore it
			if (index === -1) continue;
			// Record the port of this socket
			socketPorts.set(socket, data.port);
			// Satisfy the requirement, if there are no more, return the ports map
			requiredSockets.splice(index, 1);
			if (requiredSockets.length === 0) return socketPorts;
		}
	} finally {
		options?.signal?.removeEventListener("abort", abortListener);
	}
}

function waitForExit(process: childProcess.ChildProcess): Promise<void> {
	return new Promise((resolve) => {
		process.once("exit", () => resolve());
	});
}

function pipeOutput(stdout: Readable, stderr: Readable) {
	// TODO: may want to proxy these and prettify ✨
	// We can't just pipe() to `process.stdout/stderr` here, as Ink (used by
	// wrangler), only patches the `console.*` methods:
	// https://github.com/vadimdemedes/ink/blob/5d24ed8ada593a6c36ea5416f452158461e33ba5/readme.md#patchconsole
	// Writing directly to `process.stdout/stderr` would result in graphical
	// glitches.
	// eslint-disable-next-line no-console
	rl.createInterface(stdout).on("line", (data) => console.log(data));
	// eslint-disable-next-line no-console
	rl.createInterface(stderr).on("line", (data) => console.error(red(data)));
	// stdout.pipe(process.stdout);
	// stderr.pipe(process.stderr);
}

function getRuntimeCommand() {
	return process.env.MINIFLARE_WORKERD_PATH ?? workerdPath;
}

function getRuntimeArgs(options: RuntimeOptions) {
	const args: string[] = [
		"serve",
		// Required to use binary capnp config
		"--binary",
		// Required to use compatibility flags without a default-on date,
		// (e.g. "streams_enable_constructors"), see https://github.com/cloudflare/workerd/pull/21
		"--experimental",
		`--socket-addr=${SOCKET_ENTRY}=${options.entryAddress}`,
		`--external-addr=${SERVICE_LOOPBACK}=${options.loopbackAddress}`,
		// Configure extra pipe for receiving control messages (e.g. when ready)
		"--control-fd=3",
		// Read config from stdin
		"-",
	];
	if (options.inspectorAddress !== undefined) {
		// Required to enable the V8 inspector
		args.push(`--inspector-addr=${options.inspectorAddress}`);
	}
	if (options.verbose) {
		args.push("--verbose");
	}

	return args;
}

/**
 * Copied from https://github.com/microsoft/vscode-js-debug/blob/0b5e0dade997b3c702a98e1f58989afcb30612d6/src/targets/node/bootloader/environment.ts#L129
 *
 * This function returns the segment of process.env.VSCODE_INSPECTOR_OPTIONS that corresponds to the current process (rather than a parent process)
 */
function getInspectorOptions() {
	const value = process.env.VSCODE_INSPECTOR_OPTIONS;
	if (!value) {
		return undefined;
	}

	const ownOptions = value
		.split(":::")
		.reverse()
		.find((v) => !!v);
	if (!ownOptions) {
		return;
	}

	try {
		return JSON.parse(ownOptions);
	} catch {
		return undefined;
	}
}

class StartupLogBuffer {
	stdoutStream: Transform;
	stderrStream: Transform;
	stdoutBuffer: string[] = [];
	stderrBuffer: string[] = [];

	buffering = true;

	constructor() {
		this.stdoutStream = new Transform({
			transform: (chunk, encoding, callback) => {
				if (this.buffering) {
					this.stdoutBuffer.push(chunk.toString());
				}
				callback(null, chunk);
			},
		});
		this.stderrStream = new Transform({
			transform: (chunk, encoding, callback) => {
				if (this.buffering) {
					this.stderrBuffer.push(chunk.toString());
				}
				callback(null, chunk);
			},
		});
	}

	stopBuffering() {
		this.buffering = false;
	}

	handleStartupFailure() {
		const addressInUseLog = this.stderrBuffer.find((chunk) =>
			chunk.includes("Address already in use; toString() = ")
		);
		if (addressInUseLog) {
			const match = addressInUseLog.match(
				/Address already in use; toString\(\) = (.+):(.+)/
			) ?? ["", "unknown", "unknown"];

			throw new MiniflareCoreError(
				"ERR_ADDRESS_IN_USE",
				`Address already in use (${match[1]}:${match[2]}). Please check that you are not already running a server on this address or specify a different port with --port.`
			);
		}
	}
}

export class Runtime {
	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<void>;

	async updateConfig(
		configBuffer: Buffer,
		options: Abortable & RuntimeOptions,
		workerNames: string[],
		abortSignal: AbortSignal
	): Promise<SocketPorts | undefined> {
		// 1. Stop existing process (if any) and wait for exit
		await this.dispose();
		// TODO: what happens if runtime crashes?

		// 2. Start new process
		const command = getRuntimeCommand();
		const args = getRuntimeArgs(options);
		// By default, `workerd` will only log with colours if it detects a TTY.
		// `"pipe"` doesn't create a TTY, so we force enable colours if supported.
		const FORCE_COLOR = $colors.enabled ? "1" : "0";
		const runtimeProcess = childProcess.spawn(command, args, {
			stdio: ["pipe", "pipe", "pipe", "pipe"],
			env: { ...process.env, FORCE_COLOR },
		});
		const startupLogBuffer = new StartupLogBuffer();
		this.#process = runtimeProcess;
		this.#processExitPromise = waitForExit(runtimeProcess);

		const handleRuntimeStdio =
			options.handleRuntimeStdio ??
			(options.handleStructuredLogs
				? // If `handleStructuredLogs` is provided then by default Miniflare should not pipe through the stream's output
					() => {}
				: pipeOutput);

		handleRuntimeStdio(
			runtimeProcess.stdout.pipe(startupLogBuffer.stdoutStream),
			runtimeProcess.stderr.pipe(startupLogBuffer.stderrStream)
		);

		if (options.handleStructuredLogs) {
			handleStructuredLogsFromStream(
				startupLogBuffer.stdoutStream,
				options.handleStructuredLogs
			);
			handleStructuredLogsFromStream(
				startupLogBuffer.stderrStream,
				options.handleStructuredLogs
			);
		}

		const controlPipe = runtimeProcess.stdio[3];
		assert(controlPipe instanceof Readable);

		// 3. Write config, and wait for writing to finish
		runtimeProcess.stdin.write(configBuffer);
		runtimeProcess.stdin.end();
		await once(runtimeProcess.stdin, "finish");

		// 4. Wait for sockets to start listening
		const ports = await waitForPorts(controlPipe, options);
		if (ports?.has(kInspectorSocket) && process.env.VSCODE_INSPECTOR_OPTIONS) {
			// We have an inspector socket and we're in a VSCode Debug Terminal.
			// Let's startup a watchdog service to register ourselves as a debuggable target

			// First, we need to _find_ the watchdog script. It's located next to bootloader.js, which should be injected as a require hook
			const bootloaderPath =
				process.env.NODE_OPTIONS?.match(/--require "(.*?)"/)?.[1];

			if (!bootloaderPath) {
				return ports;
			}
			const watchdogPath = path.resolve(bootloaderPath, "../watchdog.js");

			const info = getInspectorOptions();

			for (const name of workerNames) {
				// This is copied from https://github.com/microsoft/vscode-js-debug/blob/0b5e0dade997b3c702a98e1f58989afcb30612d6/src/targets/node/bootloader.ts#L284
				// It spawns a detached "watchdog" process for each corresponding (user) Worker in workerd which will maintain the VSCode debug connection
				const p = spawn(process.execPath, [watchdogPath], {
					env: {
						NODE_INSPECTOR_INFO: JSON.stringify({
							ipcAddress: info.inspectorIpc || "",
							pid: String(this.#process.pid),
							scriptName: name,
							inspectorURL: `ws://127.0.0.1:${ports?.get(kInspectorSocket)}/core:user:${name}`,
							waitForDebugger: true,
							ownId: randomBytes(12).toString("hex"),
							openerId: info.openerId,
						}),
						NODE_SKIP_PLATFORM_CHECK: process.env.NODE_SKIP_PLATFORM_CHECK,
						ELECTRON_RUN_AS_NODE: "1",
					},
					stdio: "ignore",
					detached: true,
				});
				p.unref();
			}
		}

		startupLogBuffer.stopBuffering();

		if (ports === undefined && !abortSignal.aborted) {
			startupLogBuffer.handleStartupFailure();
		}

		return ports;
	}

	dispose(): Awaitable<void> {
		const runtimeProcess = this.#process;
		if (runtimeProcess === undefined) {
			return;
		}

		// Clear reference to prevent potential race conditions
		this.#process = undefined;

		// Explicitly destroy all stdio streams to ensure file descriptors are
		// properly released. This prevents EBADF errors when spawning a new
		// process after restart.
		// See https://github.com/cloudflare/workers-sdk/issues/11675
		runtimeProcess.stdin?.destroy();
		runtimeProcess.stdout?.destroy();
		runtimeProcess.stderr?.destroy();
		// The control pipe at stdio[3] could be a Readable stream
		const controlPipe = runtimeProcess.stdio[3];
		if (controlPipe instanceof Readable) {
			controlPipe.destroy();
		}

		// `kill()` uses `SIGTERM` by default. In `workerd`, this waits for HTTP
		// connections to close before exiting. Notably, Chrome sometimes keeps
		// connections open for about 10s, blocking exit. We'd like `dispose()`/
		// `setOptions()` to immediately terminate the existing process.
		// Therefore, use `SIGKILL` which force closes all connections.
		// See https://github.com/cloudflare/workerd/pull/244.
		runtimeProcess.kill("SIGKILL");

		return this.#processExitPromise;
	}
}

export * from "./config";
export { supportedCompatibilityDate };
