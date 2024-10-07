import assert from "node:assert";
import { pathToFileURL } from "node:url";
import { LongLivedCommand, runCommand } from "./command";
import type { CommandOptions } from "./command";

// Replace all backslashes with forward slashes to ensure that their use
// in scripts doesn't break.
export const WRANGLER = process.env.WRANGLER?.replaceAll("\\", "/") ?? "";
export const WRANGLER_IMPORT = pathToFileURL(
	process.env.WRANGLER_IMPORT?.replaceAll("\\", "/") ?? ""
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

export function runWranglerLongLived(
	wranglerCommand: string,
	options: WranglerCommandOptions = {}
) {
	return new WranglerLongLivedCommand(wranglerCommand, options);
}

export class WranglerLongLivedCommand extends LongLivedCommand {
	constructor(wranglerCommand: string, options: WranglerCommandOptions = {}) {
		super(getWranglerCommand(wranglerCommand), getOptions(options));
	}

	async waitForReady(): Promise<{ url: string }> {
		const match = await this.readUntil(/Ready on (?<url>https?:\/\/.*)/, 5_000);
		return match.groups as { url: string };
	}

	async waitForReload(readTimeout?: number): Promise<void> {
		await this.readUntil(
			/Detected changes, restarted server|Reloading local server\.\.\./,
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
	return `${WRANGLER} ${command.slice("wrangler ".length)}`;
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
