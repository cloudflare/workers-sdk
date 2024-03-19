import assert from "assert";
import childProcess from "child_process";
import { Abortable, once } from "events";
import rl from "readline";
import { Readable } from "stream";
import { $ as $colors, red } from "kleur/colors";
import workerdPath, {
	compatibilityDate as supportedCompatibilityDate,
} from "workerd";
import { z } from "zod";
import { SERVICE_LOOPBACK, SOCKET_ENTRY } from "../plugins";
import { Awaitable } from "../workers";

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

export type SocketIdentifier =
	| "entry"
	| "entry:local"
	| `direct:${number}`
	| typeof kInspectorSocket;

const directSocketIdentifierRegexp = /^direct:[0-9]+$/;
export function isSocketIdentifier(value: unknown): value is SocketIdentifier {
	if (value === kInspectorSocket) return true;
	if (typeof value !== "string") return false;
	if (value === "entry" || value === "entry:local") return true;
	return directSocketIdentifierRegexp.test(value);
}

export type SocketPorts = Map<SocketIdentifier, number /* port */>;

export interface RuntimeOptions {
	entryAddress: string;
	loopbackAddress: string;
	requiredSockets: SocketIdentifier[];
	inspectorAddress?: string;
	verbose?: boolean;
	handleRuntimeStdio?: (stdout: Readable, stderr: Readable) => void;
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
			const socket =
				data.event === "listen-inspector" ? kInspectorSocket : data.socket;
			assert(isSocketIdentifier(socket));
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
	rl.createInterface(stdout).on("line", (data) => console.log(data));
	rl.createInterface(stderr).on("line", (data) => console.error(red(data)));
	// stdout.pipe(process.stdout);
	// stderr.pipe(process.stderr);
}

function readingStream(readable: Readable) {
	const chunks: Uint8Array[] = [];
	function listener(chunk: Uint8Array | string) {
		if (chunk instanceof Uint8Array) chunks.push(chunk);
		else chunks.push(Buffer.from(chunk));
	}

	readable.on("data", listener);
	return {
		[Symbol.dispose]() {
			readable.off("data", listener);
		},
		get text() {
			return Buffer.concat(chunks).toString();
		},
	};
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

export interface RuntimeUpdateResult {
	socketPorts?: SocketPorts;
	stderr: string;
}

export class Runtime {
	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<void>;

	async updateConfig(
		configBuffer: Buffer,
		options: Abortable & RuntimeOptions
	): Promise<RuntimeUpdateResult> {
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
		this.#process = runtimeProcess;
		this.#processExitPromise = waitForExit(runtimeProcess);

		const handleRuntimeStdio = options.handleRuntimeStdio ?? pipeOutput;
		handleRuntimeStdio(runtimeProcess.stdout, runtimeProcess.stderr);
		using stderr = readingStream(runtimeProcess.stderr);

		const controlPipe = runtimeProcess.stdio[3];
		assert(controlPipe instanceof Readable);

		// 3. Write config, and wait for writing to finish
		runtimeProcess.stdin.write(configBuffer);
		runtimeProcess.stdin.end();
		await once(runtimeProcess.stdin, "finish");

		// 4. Wait for sockets to start listening
		const socketPorts = await waitForPorts(controlPipe, options);
		return { socketPorts, stderr: stderr.text };
	}

	dispose(): Awaitable<void> {
		// `kill()` uses `SIGTERM` by default. In `workerd`, this waits for HTTP
		// connections to close before exiting. Notably, Chrome sometimes keeps
		// connections open for about 10s, blocking exit. We'd like `dispose()`/
		// `setOptions()` to immediately terminate the existing process.
		// Therefore, use `SIGKILL` which force closes all connections.
		// See https://github.com/cloudflare/workerd/pull/244.
		this.#process?.kill("SIGKILL");
		return this.#processExitPromise;
	}
}

export * from "./config";
export { supportedCompatibilityDate };
