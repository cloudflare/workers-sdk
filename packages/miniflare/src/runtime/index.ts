import childProcess from "child_process";
import rl from "readline";
import { red } from "kleur/colors";
import workerdPath, {
	compatibilityDate as supportedCompatibilityDate,
} from "workerd";
import { SERVICE_LOOPBACK, SOCKET_ENTRY } from "../plugins";
import { Awaitable } from "../shared";

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
	readonly #args: string[];

	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<void>;

	constructor(private opts: RuntimeOptions) {
		const args: string[] = [
			"serve",
			// Required to use binary capnp config
			"--binary",
			// Required to use compatibility flags without a default-on date,
			// (e.g. "streams_enable_constructors"), see https://github.com/cloudflare/workerd/pull/21
			"--experimental",
			`--socket-addr=${SOCKET_ENTRY}=${this.opts.entryHost}:${this.opts.entryPort}`,
			`--external-addr=${SERVICE_LOOPBACK}=127.0.0.1:${this.opts.loopbackPort}`,
			// Read config from stdin
			"-",
		];
		if (this.opts.inspectorPort !== undefined) {
			// Required to enable the V8 inspector
			args.push(`--inspector-addr=127.0.0.1:${this.opts.inspectorPort}`);
		}
		if (this.opts.verbose) {
			args.push("--verbose");
		}

		this.#command = workerdPath;
		this.#args = args;
	}

	async updateConfig(configBuffer: Buffer) {
		// 1. Stop existing process (if any) and wait for exit
		await this.dispose();
		// TODO: what happens if runtime crashes?

		// 2. Start new process
		const runtimeProcess = childProcess.spawn(this.#command, this.#args, {
			stdio: "pipe",
			env: process.env,
		});
		this.#process = runtimeProcess;
		this.#processExitPromise = waitForExit(runtimeProcess);
		pipeOutput(runtimeProcess);

		// 3. Write config
		runtimeProcess.stdin.write(configBuffer);
		runtimeProcess.stdin.end();
	}

	get exitPromise(): Promise<void> | undefined {
		return this.#processExitPromise;
	}

	dispose(): Awaitable<void> {
		// `kill()` uses `SIGTERM` by default. In `workerd`, this waits for HTTP
		// connections to close before exiting. Notably, Chrome sometimes keeps
		// connections open for about 10s, blocking exit. We'd like `dispose()`/
		// `setOptions()` to immediately terminate the existing process.
		// Therefore, use `SIGINT` which force closes all connections.
		// See https://github.com/cloudflare/workerd/pull/244.
		this.#process?.kill("SIGINT");
		return this.#processExitPromise;
	}
}

export * from "./config";
export { supportedCompatibilityDate };
