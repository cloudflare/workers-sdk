import childProcess from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { red } from "kleur/colors";
import workerdPath, {
	compatibilityDate as supportedCompatibilityDate,
} from "workerd";
import { SERVICE_LOOPBACK, SOCKET_ENTRY } from "../plugins";
import { Awaitable, MiniflareCoreError } from "../shared";

export interface RuntimeOptions {
	entryHost: string;
	entryPort: number;
	loopbackPort: number;
	inspectorPort?: number;
	verbose?: boolean;
}

export abstract class Runtime {
	constructor(protected readonly opts: RuntimeOptions) {}

	abstract updateConfig(configBuffer: Buffer): Awaitable<void>;
	abstract get exitPromise(): Promise<void> | undefined;
	abstract dispose(): Awaitable<void>;

	protected getCommonArgs(): string[] {
		const args: string[] = [
			"serve",
			// Required to use binary capnp config
			"--binary",
			// Required to use compatibility flags without a default-on date,
			// (e.g. "streams_enable_constructors"), see https://github.com/cloudflare/workerd/pull/21
			"--experimental",
		];
		if (this.opts.inspectorPort !== undefined) {
			// Required to enable the V8 inspector
			args.push(`--inspector-addr=127.0.0.1:${this.opts.inspectorPort}`);
		}
		if (this.opts.verbose) {
			args.push("--verbose");
		}
		return args;
	}
}

export interface RuntimeConstructor {
	new (opts: RuntimeOptions): Runtime;

	isSupported(): boolean;
	supportSuggestion: string;
	description: string;
}

function waitForExit(process: childProcess.ChildProcess): Promise<void> {
	return new Promise((resolve) => {
		process.once("exit", () => resolve());
	});
}

function trimTrailingNewline(buffer: Buffer) {
	let string = buffer.toString();
	if (string.endsWith("\n")) string = string.substring(0, string.length - 1);
	return string;
}
function pipeOutput(runtime: childProcess.ChildProcessWithoutNullStreams) {
	// TODO: may want to proxy these and prettify ✨
	// We can't just pipe() to `process.stdout/stderr` here, as Ink (used by
	// wrangler), only patches the `console.*` methods:
	// https://github.com/vadimdemedes/ink/blob/5d24ed8ada593a6c36ea5416f452158461e33ba5/readme.md#patchconsole
	// Writing directly to `process.stdout/stderr` would result in graphical
	// glitches.
	runtime.stdout.on("data", (data) => {
		console.log(trimTrailingNewline(data));
	});
	runtime.stderr.on("data", (data) => {
		console.error(red(trimTrailingNewline(data)));
	});
	// runtime.stdout.pipe(process.stdout);
	// runtime.stderr.pipe(process.stderr);
}

class NativeRuntime extends Runtime {
	static isSupported() {
		return process.platform === "linux" || process.platform === "darwin";
	}
	static supportSuggestion = "Run using a Linux or macOS based system";
	static description = "natively ⚡️";

	readonly #command: string;
	readonly #args: string[];

	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<void>;

	constructor(opts: RuntimeOptions) {
		super(opts);
		const [command, ...args] = this.getCommand();
		this.#command = command;
		this.#args = args;
	}

	getCommand(): string[] {
		return [
			workerdPath,
			...this.getCommonArgs(),
			`--socket-addr=${SOCKET_ENTRY}=${this.opts.entryHost}:${this.opts.entryPort}`,
			`--external-addr=${SERVICE_LOOPBACK}=127.0.0.1:${this.opts.loopbackPort}`,
			// TODO: consider adding support for unix sockets?
			// `--socket-fd=${SOCKET_ENTRY}=${this.entryPort}`,
			// `--external-addr=${SERVICE_LOOPBACK}=${this.loopbackPort}`,
			"-",
		];
	}

	async updateConfig(configBuffer: Buffer) {
		// 1. Stop existing process (if any) and wait for exit
		await this.dispose();
		// TODO: what happens if runtime crashes?

		// 2. Start new process
		const runtimeProcess = childProcess.spawn(this.#command, this.#args, {
			stdio: "pipe",
			shell: true,
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
		this.#process?.kill();
		return this.#processExitPromise;
	}
}

class WSLRuntime extends NativeRuntime {
	static isSupported() {
		return process.platform === "win32"; // TODO: && parse output from `wsl --list --verbose`, may need to check distro?;
	}
	static supportSuggestion =
		"Install the Windows Subsystem for Linux (https://aka.ms/wsl), " +
		"then run as you are at the moment";
	static description = "using WSL ✨";

	getCommand(): string[] {
		const command = super.getCommand();
		command.unshift("wsl"); // TODO: may need to select distro?
		// TODO: may need to convert runtime path to /mnt/c/...
		return command;
	}
}

// `__dirname` relative to bundled output `dist/src/index.js`
const RESTART_PATH = path.resolve(__dirname, "..", "..", "lib", "restart.sh");

class DockerRuntime extends Runtime {
	static isSupported() {
		const result = childProcess.spawnSync("docker", ["--version"]); // TODO: check daemon running too?
		return result.error === undefined;
	}
	static supportSuggestion =
		"Install Docker Desktop (https://www.docker.com/products/docker-desktop/), " +
		"then run as you are at the moment";
	static description = "using Docker 🐳";

	#configPath = path.join(
		os.tmpdir(),
		`miniflare-config-${crypto.randomBytes(16).toString("hex")}.bin`
	);

	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<void>;

	async updateConfig(configBuffer: Buffer) {
		// 1. Write config to file (this is much easier than trying to buffer STDIN
		//    in the restart script)
		fs.writeFileSync(this.#configPath, configBuffer);

		// 2. If process running, send SIGUSR1 to restart runtime with new config
		//    (see `lib/restart.sh`)
		if (this.#process) {
			this.#process.kill("SIGUSR1");
			return;
		}

		// 3. Otherwise, start new process
		const runtimeProcess = childProcess.spawn(
			"docker",
			[
				"run",
				"--platform=linux/amd64",
				"--interactive",
				"--rm",
				`--volume=${RESTART_PATH}:/restart.sh`,
				`--volume=${workerdPath}:/runtime`,
				`--volume=${this.#configPath}:/miniflare-config.bin`,
				`--publish=${this.opts.entryHost}:${this.opts.entryPort}:8787`,
				"debian:bullseye-slim",
				"/restart.sh",
				"/runtime",
				...this.getCommonArgs(),
				`--socket-addr=${SOCKET_ENTRY}=*:8787`,
				`--external-addr=${SERVICE_LOOPBACK}=host.docker.internal:${this.opts.loopbackPort}`,
				"/miniflare-config.bin",
			],
			{
				stdio: "pipe",
				shell: true,
			}
		);
		this.#process = runtimeProcess;
		this.#processExitPromise = waitForExit(runtimeProcess);
		pipeOutput(runtimeProcess);
	}

	get exitPromise(): Promise<void> | undefined {
		return this.#processExitPromise;
	}

	dispose(): Awaitable<void> {
		this.#process?.kill();
		try {
			fs.unlinkSync(this.#configPath);
		} catch (e: any) {
			// Ignore not found errors if we called dispose() without updateConfig()
			if (e.code !== "ENOENT") throw e;
		}
		return this.#processExitPromise;
	}
}

const RUNTIMES = [NativeRuntime, WSLRuntime, DockerRuntime];
let supportedRuntime: RuntimeConstructor;
export function getSupportedRuntime(): RuntimeConstructor {
	// Return cached result to avoid checking support more than required
	if (supportedRuntime !== undefined) return supportedRuntime;

	// Return and cache the best runtime (`RUNTIMES` is sorted by preference)
	for (const runtime of RUNTIMES) {
		if (runtime.isSupported()) {
			return (supportedRuntime = runtime);
		}
	}

	// Throw with installation suggestions if we couldn't find a supported one
	const suggestions = RUNTIMES.map(
		({ supportSuggestion }) => `- ${supportSuggestion}`
	);
	throw new MiniflareCoreError(
		"ERR_RUNTIME_UNSUPPORTED",
		`The 🦄 Cloudflare Workers Runtime 🦄 does not support your system (${
			process.platform
		} ${process.arch}). Either:\n${suggestions.join("\n")}\n`
	);
}

export * from "./config";
export { supportedCompatibilityDate };
