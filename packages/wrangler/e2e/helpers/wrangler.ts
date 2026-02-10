import assert from "node:assert";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LongLivedCommand, runCommand } from "./command";
import type { CommandOptions } from "./command";

// Replace all backslashes with forward slashes to ensure that their use
// in scripts doesn't break.
export const WRANGLER =
	process.env.WRANGLER?.replaceAll("\\", "/") ??
	`node --no-warnings ${resolve(__dirname, "../../bin/wrangler.js")}`;
export const WRANGLER_IMPORT = pathToFileURL(
	process.env.WRANGLER_IMPORT?.replaceAll("\\", "/") ??
		resolve(__dirname, "../../wrangler-dist/cli.js")
);
export const MINIFLARE_IMPORT = pathToFileURL(
	process.env.MINIFLARE_IMPORT?.replaceAll("\\", "/") ??
		resolve(__dirname, "../../../miniflare/dist/src/index.js")
);

export type WranglerCommandOptions = CommandOptions & { debug?: boolean };

export async function runWrangler(
	wranglerCommand: string,
	{ cwd, env = process.env, debug, timeout }: WranglerCommandOptions = {}
) {
	if (debug) {
		env = { ...env, WRANGLER_LOG: "debug" };
	}
	return runCommand(getWranglerCommand(wranglerCommand), { cwd, env, timeout });
}

export class WranglerLongLivedCommand extends LongLivedCommand {
	constructor(wranglerCommand: string, options: WranglerCommandOptions = {}) {
		super(getWranglerCommand(wranglerCommand), getOptions(options));
	}

	async waitForReady(readTimeout = 15_000): Promise<{ url: string }> {
		const match = await this.readUntil(
			/Ready on (?<url>https?:\/\/.*)/,
			readTimeout
		);
		return match.groups as { url: string };
	}

	async waitForReload(readTimeout = 15_000): Promise<void> {
		await this.readUntil(
			/Detected changes, restarted server|Local server updated and ready/,
			readTimeout
		);
	}
}

function getWranglerCommand(command: string) {
	// Enforce a `wrangler` prefix to make commands clearer to read
	assert(
		command.startsWith("wrangler "),
		"Commands must start with `wrangler` (e.g. `wrangler dev`) but got " +
			command
	);

	// If the user hasn't specifically set an inspector port, set it to 0 to reduce port conflicts
	const inspectorPort =
		command.includes(`--inspector-port`) || !command.startsWith("wrangler dev")
			? ""
			: " --inspector-port 0";

	// If the user hasn't specifically set a Worker port, set it to 0 to reduce port conflicts
	const workerPort =
		command.includes(`--port`) || !command.startsWith("wrangler dev")
			? ""
			: " --port 0";
	return `${WRANGLER} ${command.slice("wrangler ".length)}${inspectorPort}${workerPort}`;
}

function getOptions({
	cwd,
	env = process.env,
	debug,
	timeout,
}: WranglerCommandOptions): CommandOptions {
	if (debug) {
		env = { ...env, WRANGLER_LOG: "debug" };
	}
	return {
		cwd,
		env,
		timeout,
	};
}
