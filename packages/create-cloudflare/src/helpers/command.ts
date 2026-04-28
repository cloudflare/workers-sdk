import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { readMetricsConfig } from "./metrics-config";
import type { RunOptions } from "@cloudflare/cli-shared-helpers/command";

/**
 * Runs a wrangler command with C3-specific telemetry handling.
 *
 * - Sets WRANGLER_SEND_METRICS=false when C3 telemetry is disabled
 * - Always sets WRANGLER_HIDE_BANNER=true for cleaner output
 */
export const runWranglerCommand = async (
	command: string[],
	opts: RunOptions = {}
): Promise<string> => {
	const env: NodeJS.ProcessEnv = { ...opts.env };

	// Don't send metrics data on wrangler commands if telemetry is disabled in C3
	// If telemetry is disabled separately for wrangler, wrangler will handle that
	const metrics = readMetricsConfig();
	if (metrics.c3permission?.enabled === false) {
		env["WRANGLER_SEND_METRICS"] = "false";
	}
	env["WRANGLER_HIDE_BANNER"] = "true";

	return runCommand(command, { ...opts, env });
};
