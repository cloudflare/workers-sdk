import { spawn } from "node:child_process";
import process from "node:process";
import { logger } from "../logger";
import { parse } from "../utils/shell-quote";
import { CODEX_MICRO_KEYS } from "./protocol";
import type { CodexMicroKeymap } from "./keymap";
import type { CodexMicroKey, CodexMicroKeyEvent } from "./protocol";
import type { ChildProcess, SpawnOptions } from "node:child_process";

const DEPLOY_CONFIRMATION_WINDOW_MS = 1_500;
const FORCE_KILL_AFTER_MS = 3_000;

interface CommandDefinition {
	args: string[];
	confirm: boolean;
	label: string;
	toggle: boolean;
}

const DEFAULT_COMMANDS: Partial<Record<CodexMicroKey, CommandDefinition>> = {
	AG00: { args: ["dev"], confirm: false, label: "dev", toggle: true },
	AG01: {
		args: ["deploy", "--dry-run"],
		confirm: false,
		label: "deploy --dry-run",
		toggle: false,
	},
	AG02: { args: ["deploy"], confirm: true, label: "deploy", toggle: false },
	AG03: { args: ["tail"], confirm: false, label: "tail", toggle: true },
	AG04: { args: ["types"], confirm: false, label: "types", toggle: false },
};

export interface CodexMicroCommandRunnerOptions {
	cliPath: string;
	projectPath: string;
	now?: () => number;
	schedule?: typeof setTimeout;
	spawnProcess?: (
		command: string,
		args: string[],
		options: SpawnOptions
	) => ChildProcess;
	killProcess?: (pid: number, signal: NodeJS.Signals) => void;
	keymap?: CodexMicroKeymap;
}

export class CodexMicroCommandRunner {
	readonly #active = new Map<CodexMicroKey, ChildProcess>();
	readonly #ag05StopsAll: boolean;
	readonly #cliPath: string;
	readonly #commands: Partial<Record<CodexMicroKey, CommandDefinition>>;
	readonly #killProcess: (pid: number, signal: NodeJS.Signals) => void;
	readonly #now: () => number;
	readonly #projectPath: string;
	readonly #schedule: typeof setTimeout;
	readonly #spawnProcess: (
		command: string,
		args: string[],
		options: SpawnOptions
	) => ChildProcess;
	#deployConfirmationExpiresAt = 0;

	constructor(options: CodexMicroCommandRunnerOptions) {
		this.#cliPath = options.cliPath;
		this.#commands = applyKeymap(options.keymap);
		this.#ag05StopsAll = this.#commands.AG05 === undefined;
		this.#projectPath = options.projectPath;
		this.#now = options.now ?? Date.now;
		this.#schedule = options.schedule ?? setTimeout;
		this.#spawnProcess = options.spawnProcess ?? spawn;
		this.#killProcess =
			options.killProcess ??
			((pid, signal) => {
				process.kill(-pid, signal);
			});
	}

	handleKey(event: CodexMicroKeyEvent): void {
		if (event.action === 0) {
			return;
		}

		const definition = this.#commands[event.key];
		if (event.key === "AG05" && this.#ag05StopsAll) {
			this.stopAll();
			return;
		}

		if (definition === undefined) {
			return;
		}

		const active = this.#active.get(event.key);
		if (active !== undefined) {
			if (definition.toggle) {
				this.#stop(event.key, active);
			} else {
				logger.warn(
					`Codex Micro ignored ${definition.label}; it is already running.`
				);
			}
			return;
		}

		if (definition.confirm && !this.#confirmDeploy()) {
			return;
		}

		this.#start(event.key, definition);
	}

	stopAll(): void {
		for (const [key, child] of this.#active) {
			this.#stop(key, child);
		}
	}

	#confirmDeploy(): boolean {
		const now = this.#now();
		if (now <= this.#deployConfirmationExpiresAt) {
			this.#deployConfirmationExpiresAt = 0;
			return true;
		}

		this.#deployConfirmationExpiresAt = now + DEPLOY_CONFIRMATION_WINDOW_MS;
		logger.warn(
			"Codex Micro deploy requested. Press the deploy key again within 1.5 seconds to confirm."
		);
		return false;
	}

	#start(key: CodexMicroKey, definition: CommandDefinition): void {
		logger.log(`Codex Micro starting wrangler ${definition.label}.`);
		const child = this.#spawnProcess(
			process.execPath,
			[
				"--no-warnings",
				this.#cliPath,
				"--cwd",
				this.#projectPath,
				...definition.args,
			],
			{
				cwd: this.#projectPath,
				detached: true,
				env: process.env,
				stdio: ["ignore", "inherit", "inherit"],
			}
		);
		this.#active.set(key, child);

		child.once("error", (error) => {
			if (this.#active.get(key) === child) {
				this.#active.delete(key);
			}
			logger.error(`Codex Micro failed to start ${definition.label}:`, error);
		});
		child.once("exit", (code, signal) => {
			if (this.#active.get(key) === child) {
				this.#active.delete(key);
			}
			logger.log(
				`Codex Micro wrangler ${definition.label} exited`,
				signal === null ? `with code ${code ?? 0}.` : `from ${signal}.`
			);
		});
	}

	#stop(key: CodexMicroKey, child: ChildProcess): void {
		const definition = this.#commands[key];
		if (definition === undefined) {
			return;
		}
		logger.log(`Codex Micro stopping wrangler ${definition.label}.`);
		if (!this.#signal(child, "SIGTERM")) {
			this.#active.delete(key);
			return;
		}

		this.#schedule(() => {
			if (this.#active.get(key) === child) {
				this.#signal(child, "SIGKILL");
			}
		}, FORCE_KILL_AFTER_MS).unref();
	}

	#signal(child: ChildProcess, signal: NodeJS.Signals): boolean {
		if (child.pid === undefined) {
			return false;
		}

		try {
			this.#killProcess(child.pid, signal);
			return true;
		} catch (error) {
			if (isMissingProcessError(error)) {
				return false;
			}
			logger.error(`Codex Micro failed to send ${signal}:`, error);
			return false;
		}
	}
}

function applyKeymap(
	keymap: CodexMicroKeymap | undefined
): Partial<Record<CodexMicroKey, CommandDefinition>> {
	const commands: Partial<Record<CodexMicroKey, CommandDefinition>> = {
		...DEFAULT_COMMANDS,
	};
	if (keymap === undefined) {
		return commands;
	}

	for (const key of CODEX_MICRO_KEYS) {
		const action = keymap[key];
		if (action === undefined) {
			continue;
		}

		let args: string[];
		try {
			args = parse(action);
		} catch (error) {
			delete commands[key];
			logger.warn(`Codex Micro ignored the ${key} keymap action.`, error);
			continue;
		}
		if (args.length === 0) {
			delete commands[key];
			continue;
		}
		commands[key] = {
			args,
			confirm: false,
			label: action,
			toggle: false,
		};
	}
	return commands;
}

function isMissingProcessError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ESRCH"
	);
}
