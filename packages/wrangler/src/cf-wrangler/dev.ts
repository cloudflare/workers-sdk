/**
 * `dev` verb runtime for the `cf-wrangler` delegate entrypoint.
 *
 * Wraps wrangler's internal `startDev` — the same function `wrangler dev`
 * runs — in the experimental-flags async-local context this entrypoint
 * needs, and blocks until the dev session tears down. Argv parsing and
 * the `StartDevOptions` literal live in `bin/cf-wrangler.js`.
 */
import events from "node:events";
import { startDev } from "../dev/start-dev";
import { run } from "../experimental-flags";
import type { StartDevOptions } from "../dev";

/**
 * Run the dev server until it tears down (a hotkey quit in a TTY, or a
 * signal from a non-interactive parent). Mirrors `wrangler dev`'s command
 * handler and installs no signal handlers of its own, so signal handling
 * and exit codes match `wrangler dev` exactly.
 *
 * @param options Fully-built `StartDevOptions` (built in `bin/cf-wrangler.js`).
 * @returns `0` on a clean teardown.
 */
export async function runCfWranglerDev(
	options: StartDevOptions
): Promise<number> {
	// `startDev` reads experimental flags from async-local storage. This
	// entrypoint is single-worker and never provisions resources.
	const devInstance = await run(
		{
			MULTIWORKER: false,
			RESOURCES_PROVISION: false,
			AUTOCREATE_RESOURCES: false,
		},
		() => startDev(options)
	);

	await events.once(devInstance.devEnv, "teardown");
	await Promise.all(devInstance.secondary.map((d) => d.teardown()));
	devInstance.unregisterHotKeys?.();

	return 0;
}
