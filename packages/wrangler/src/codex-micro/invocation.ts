import path from "node:path";
import process from "node:process";
import { UserError } from "@cloudflare/workers-utils";
import { runInstalledCodexMicroDaemon } from "./daemon";
import { installCodexMicroDaemon, uninstallCodexMicroDaemon } from "./install";

const ACTION_FLAGS = [
	"--install-codex-daemon",
	"--uninstall-codex-daemon",
	"--run-codex-daemon",
] as const;

type ActionFlag = (typeof ACTION_FLAGS)[number];

interface InvocationDependencies {
	cliPath?: string;
	install?: typeof installCodexMicroDaemon;
	run?: typeof runInstalledCodexMicroDaemon;
	uninstall?: typeof uninstallCodexMicroDaemon;
}

export async function maybeHandleCodexMicroInvocation(
	argv: string[],
	dependencies: InvocationDependencies = {}
): Promise<boolean> {
	const actions = ACTION_FLAGS.filter((flag) => argv.includes(flag));
	if (actions.length === 0) {
		return false;
	}
	if (!argv.includes("--secret")) {
		throw new UserError("Unknown argument.", {
			telemetryMessage: "codex micro secret missing",
		});
	}
	if (actions.length !== 1) {
		throw new UserError("Specify exactly one Codex Micro daemon action.", {
			telemetryMessage: "codex micro multiple actions",
		});
	}

	const projectPath = parseProjectPath(argv);
	const entrypoint = dependencies.cliPath ?? process.argv[1];
	if (entrypoint === undefined) {
		throw new UserError("Unable to locate the Wrangler entrypoint.", {
			telemetryMessage: "codex micro cli path unavailable",
		});
	}
	const cliPath = path.resolve(entrypoint);
	const action = actions[0];

	if (action === "--install-codex-daemon") {
		await (dependencies.install ?? installCodexMicroDaemon)({
			cliPath,
			projectPath,
		});
	} else if (action === "--uninstall-codex-daemon") {
		await (dependencies.uninstall ?? uninstallCodexMicroDaemon)({});
	} else {
		await (dependencies.run ?? runInstalledCodexMicroDaemon)({
			cliPath,
			projectPath,
		});
	}
	return true;
}

function parseProjectPath(argv: string[]): string {
	let projectPath = process.cwd();
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--secret" || isActionFlag(argument)) {
			continue;
		}
		if (argument === "--cwd") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("-")) {
				throw new UserError("The --cwd flag requires a directory.", {
					telemetryMessage: "codex micro cwd missing",
				});
			}
			projectPath = value;
			index++;
			continue;
		}
		if (argument?.startsWith("--cwd=")) {
			const value = argument.slice("--cwd=".length);
			if (value.length === 0) {
				throw new UserError("The --cwd flag requires a directory.", {
					telemetryMessage: "codex micro cwd missing",
				});
			}
			projectPath = value;
			continue;
		}
		throw new UserError(`Unknown argument: ${argument}`, {
			telemetryMessage: "codex micro unknown argument",
		});
	}
	return path.resolve(projectPath);
}

function isActionFlag(argument: string | undefined): argument is ActionFlag {
	return ACTION_FLAGS.some((flag) => flag === argument);
}
