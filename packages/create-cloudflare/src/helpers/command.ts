import { runCommand as runCommandBase } from "@cloudflare/workers-utils";
import { readMetricsConfig } from "./metrics-config";

/**
 * Command is a string array, like ['git', 'commit', '-m', '"Initial commit"']
 */
type Command = string[];

type RunOptions = {
	startText?: string;
	doneText?: string | ((output: string) => string);
	silent?: boolean;
	captureOutput?: boolean;
	useSpinner?: boolean;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	/** If defined this function is called to all you to transform the output from the command into a new string. */
	transformOutput?: (output: string) => string;
};

/**
 * Thin wrapper around the `runCommand` from `@cloudflare/workers-utils` that
 * automatically injects wrangler-specific environment variables when the
 * command being executed is a wrangler invocation.
 *
 * - `WRANGLER_HIDE_BANNER` is always set to `"true"` so the version banner
 *   does not pollute captured output.
 * - `WRANGLER_SEND_METRICS` is set to `"false"` when the user has opted out
 *   of C3 telemetry, so wrangler respects that preference.
 */
export const runCommand = async (
	command: Command,
	opts: RunOptions = {}
): Promise<string> => {
	const [_executable, ...args] = command;

	// Don't send metrics data on any wrangler commands if telemetry is disabled in C3
	// If telemetry is disabled separately for wrangler, wrangler will handle that
	if (args[0] === "wrangler") {
		opts.env ??= {};
		const metrics = readMetricsConfig();
		if (metrics.c3permission?.enabled === false) {
			opts.env["WRANGLER_SEND_METRICS"] = "false";
		}
		opts.env["WRANGLER_HIDE_BANNER"] = "true";
	}

	return runCommandBase(command, opts);
};
