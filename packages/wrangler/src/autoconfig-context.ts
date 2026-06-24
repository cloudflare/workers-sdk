import { getCacheFolder } from "./config-cache";
import { confirm, prompt, select } from "./dialogs";
import { isNonInteractiveOrCI } from "./is-interactive";
import { logger } from "./logger";
import type { AutoConfigContext } from "@cloudflare/autoconfig";

/**
 * Creates an `AutoConfigContext` that wires Wrangler's internal logger, dialogs,
 * metrics, and other infrastructure into the generic autoconfig system.
 *
 * @returns A fully-configured `AutoConfigContext` for use with `@cloudflare/autoconfig`.
 */
export function createWranglerAutoConfigContext(): AutoConfigContext {
	return {
		logger,
		dialogs: { confirm, prompt, select },
		runCommand: async (command, cwd, label) => {
			const { runCommand: runCustomBuild } =
				await import("./deployment-bundle/run-custom-build");
			await runCustomBuild(command, cwd, label);
		},
		isNonInteractiveOrCI,
		getCacheFolder,
	};
}
