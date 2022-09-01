import childProcess from "child_process";
import { Awaitable, MiniflareError } from "../helpers";
import { SERVICE_LOOPBACK, SOCKET_ENTRY } from "../plugins";

export interface Runtime {
	updateConfig(configBuffer: Buffer): Awaitable<void>;
	dispose(): Awaitable<void>;
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

function waitForExit(process: childProcess.ChildProcess): Promise<number> {
	return new Promise((resolve) => {
		process.once("exit", (code) => resolve(code ?? -1));
	});
}

class NativeRuntime implements Runtime {
	static isSupported() {
		return process.platform === "linux"; // TODO: and "darwin"?
	}
	static supportSuggestion = "Run using a Linux or macOS based system";
	static description = "natively ⚡️";
	static distribution = `${process.platform}-${process.arch}`;

	readonly #command: string;
	readonly #args: string[];

	#process?: childProcess.ChildProcess;
	#processExitPromise?: Promise<number>;

	constructor(
		protected readonly runtimeBinaryPath: string,
		protected readonly entryPort: number,
		protected readonly loopbackPort: number
	) {
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
		const runtimeProcess = await childProcess.spawn(this.#command, this.#args, {
			stdio: "pipe",
			shell: true,
		});
		this.#process = runtimeProcess;
		this.#processExitPromise = waitForExit(runtimeProcess);

		// TODO: may want to proxy these and prettify ✨
		// runtimeProcess.stdout.on("data", (data) => process.stdout.write(data));
		// runtimeProcess.stderr.on("data", (data) => process.stderr.write(data));
		runtimeProcess.stdout.pipe(process.stdout);
		runtimeProcess.stderr.pipe(process.stderr);

		// 3. Write config
		runtimeProcess.stdin.write(configBuffer);
	}

	async dispose() {
		this.#process?.kill();
		await this.#processExitPromise;
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

class DockerRuntime extends NativeRuntime {
	static isSupported() {
		const result = childProcess.spawnSync("docker", ["--version"]); // TODO: check daemon running too?
		return result.error === undefined;
	}
	static supportSuggestion =
		"Install Docker Desktop (https://www.docker.com/products/docker-desktop/), " +
		"then run as you are at the moment";
	static description = "using Docker 🐳";
	static distribution = `linux-${process.arch}`;

	getCommand(): string[] {
		// TODO: consider reusing container, but just restarting process within
		return [
			"docker",
			"run",
			"--platform=linux/amd64",
			"--interactive",
			"--rm",
			`--volume=${this.runtimeBinaryPath}:/runtime`,
			`--publish=127.0.0.1:${this.entryPort}:8787`,
			"debian:bullseye-slim",
			"/runtime",
			...COMMON_RUNTIME_ARGS,
			`--socket-addr=${SOCKET_ENTRY}=*:8787`,
			`--external-addr=${SERVICE_LOOPBACK}=host.docker.internal:${this.loopbackPort}`,
			"-",
		];
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
	throw new MiniflareError(
		"ERR_RUNTIME_UNSUPPORTED",
		`The 🦄 Cloudflare Workers Runtime 🦄 does not support your system (${
			process.platform
		} ${process.arch}). Either:\n${suggestions.join("\n")}\n`
	);
}

export * from "./config";
