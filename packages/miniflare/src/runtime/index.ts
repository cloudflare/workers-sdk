import assert from "assert";
import childProcess from "child_process";
import type { Abortable } from "events";
import rl from "readline";
import { Readable } from "stream";
import { red } from "kleur/colors";
import workerdPath, {
	compatibilityDate as supportedCompatibilityDate,
} from "workerd";
import { z } from "zod";
import { SERVICE_LOOPBACK, SOCKET_ENTRY } from "../plugins";
import { Awaitable } from "../workers";

const ControlMessageSchema = z.object({
	event: z.literal("listen"),
	socket: z.string(),
	port: z.number(),
});

export type SocketIdentifier = string;

async function waitForPorts(
	requiredSockets: SocketIdentifier[],
	stream: Readable,
	options?: Abortable
): Promise<Map<SocketIdentifier, number> | undefined> {
	if (options?.signal?.aborted) return;
	const lines = rl.createInterface(stream);
	// Calling `close()` will end the async iterator below and return undefined
	const abortListener = () => lines.close();
	options?.signal?.addEventListener("abort", abortListener, { once: true });
	// We're going to be mutating `sockets`, so shallow copy it
	requiredSockets = Array.from(requiredSockets);
	const socketPorts = new Map<SocketIdentifier, number>();
	try {
		for await (const line of lines) {
			const message = ControlMessageSchema.safeParse(JSON.parse(line));
			// If this was an unrecognised control message, ignore it
			if (!message.success) continue;
			const socket = message.data.socket;
			const index = requiredSockets.indexOf(socket);
			// If this wasn't a required socket, ignore it
			if (index === -1) continue;
			// Record the port of this socket
			socketPorts.set(socket, message.data.port);
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

function pipeOutput(runtime: childProcess.ChildProcessWithoutNullStreams) {
	// TODO: may want to proxy these and prettify ✨
	// We can't just pipe() to `process.stdout/stderr` here, as Ink (used by
	// wrangler), only patches the `console.*` methods:
	// https://github.com/vadimdemedes/ink/blob/5d24ed8ada593a6c36ea5416f452158461e33ba5/readme.md#patchconsole
	// Writing directly to `process.stdout/stderr` would result in graphical
	// glitches.
	const stdout = rl.createInterface(runtime.stdout);
	const stderr = rl.createInterface(runtime.stderr);
	stdout.on("line", (data) => console.log(data));
	stderr.on("line", (data) => console.error(red(data)));
	// runtime.stdout.pipe(process.stdout);
	// runtime.stderr.pipe(process.stderr);
}

export interface RuntimeOptions {
	entryHost: string;
	entryPort: number;
	loopbackPort: number;
	inspectorPort?: number;
	verbose?: boolean;
}

export class Runtime {
	readonly #command: string;

	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<void>;

	constructor(private opts: RuntimeOptions) {
		this.#command = process.env.MINIFLARE_WORKERD_PATH ?? workerdPath;
	}

	get #args() {
		const args: string[] = [
			"serve",
			// Required to use binary capnp config
			"--binary",
			// Required to use compatibility flags without a default-on date,
			// (e.g. "streams_enable_constructors"), see https://github.com/cloudflare/workerd/pull/21
			"--experimental",
			`--socket-addr=${SOCKET_ENTRY}=${this.opts.entryHost}:${this.opts.entryPort}`,
			`--external-addr=${SERVICE_LOOPBACK}=localhost:${this.opts.loopbackPort}`,
			// Configure extra pipe for receiving control messages (e.g. when ready)
			"--control-fd=3",
			// Read config from stdin
			"-",
		];
		if (this.opts.inspectorPort !== undefined) {
			// Required to enable the V8 inspector
			args.push(`--inspector-addr=localhost:${this.opts.inspectorPort}`);
		}
		if (this.opts.verbose) {
			args.push("--verbose");
		}

		return args;
	}

	async updateConfig(
		configBuffer: Buffer,
		requiredSockets: SocketIdentifier[],
		options?: Abortable & Partial<Pick<RuntimeOptions, "entryPort">>
	): Promise<Map<SocketIdentifier, number /* port */> | undefined> {
		// 1. Stop existing process (if any) and wait for exit
		await this.dispose();
		// TODO: what happens if runtime crashes?

		if (options?.entryPort !== undefined) {
			this.opts.entryPort = options.entryPort;
		}

		// 2. Start new process
		const runtimeProcess = childProcess.spawn(this.#command, this.#args, {
			stdio: ["pipe", "pipe", "pipe", "pipe"],
			env: process.env,
		});
		this.#process = runtimeProcess;
		this.#processExitPromise = waitForExit(runtimeProcess);
		pipeOutput(runtimeProcess);

		const controlPipe = runtimeProcess.stdio[3];
		assert(controlPipe instanceof Readable);

		// 3. Write config
		runtimeProcess.stdin.write(configBuffer);
		runtimeProcess.stdin.end();

		// 4. Wait for sockets to start listening
		return waitForPorts(requiredSockets, controlPipe, options);
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
