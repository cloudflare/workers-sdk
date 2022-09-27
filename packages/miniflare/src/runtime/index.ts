import childProcess from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { SERVICE_LOOPBACK, SOCKET_ENTRY } from "../plugins";
import { Awaitable, MiniflareCoreError } from "../shared";

export abstract class Runtime {
	constructor(
		protected readonly runtimeBinaryPath: string,
		protected readonly entryPort: number,
		protected readonly loopbackPort: number
	) {}

	abstract updateConfig(configBuffer: Buffer): Awaitable<void>;
	abstract get exitPromise(): Promise<void> | undefined;
	abstract dispose(): Awaitable<void>;
}

export interface RuntimeConstructor {
	new (
		runtimeBinaryPath: string,
		entryPort: number,
		loopbackPort: number
	): Runtime;

	isSupported(): boolean;
	supportSuggestion: string;
	description: string;
	distribution: string;
}

const COMMON_RUNTIME_ARGS = ["serve", "--binary", "--verbose"];
// `__dirname` relative to bundled output `dist/src/index.js`
const RESTART_PATH = path.resolve(__dirname, "..", "..", "lib", "restart.sh");

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
		console.error(trimTrailingNewline(data));
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
	static distribution = `${process.platform}-${process.arch}`;

	readonly #command: string;
	readonly #args: string[];

	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<void>;

	constructor(
		runtimeBinaryPath: string,
		entryPort: number,
		loopbackPort: number
	) {
		super(runtimeBinaryPath, entryPort, loopbackPort);
		const [command, ...args] = this.getCommand();
		this.#command = command;
		this.#args = args;
	}

	getCommand(): string[] {
		return [
			this.runtimeBinaryPath,
			...COMMON_RUNTIME_ARGS,
			`--socket-addr=${SOCKET_ENTRY}=127.0.0.1:${this.entryPort}`,
			`--external-addr=${SERVICE_LOOPBACK}=127.0.0.1:${this.loopbackPort}`,
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
	static distribution = `linux-${process.arch}`;

	getCommand(): string[] {
		const command = super.getCommand();
		command.unshift("wsl"); // TODO: may need to select distro?
		// TODO: may need to convert runtime path to /mnt/c/...
		return command;
	}
}

class DockerRuntime extends Runtime {
	static isSupported() {
		const result = childProcess.spawnSync("docker", ["--version"]); // TODO: check daemon running too?
		return result.error === undefined;
	}
	static supportSuggestion =
		"Install Docker Desktop (https://www.docker.com/products/docker-desktop/), " +
		"then run as you are at the moment";
	static description = "using Docker 🐳";
	static distribution = `linux-${process.arch}`;

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
				`--volume=${this.runtimeBinaryPath}:/runtime`,
				`--volume=${this.#configPath}:/miniflare-config.bin`,
				`--publish=127.0.0.1:${this.entryPort}:8787`,
				"debian:bullseye-slim",
				"/restart.sh",
				"/runtime",
				...COMMON_RUNTIME_ARGS,
				`--socket-addr=${SOCKET_ENTRY}=*:8787`,
				`--external-addr=${SERVICE_LOOPBACK}=host.docker.internal:${this.loopbackPort}`,
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
