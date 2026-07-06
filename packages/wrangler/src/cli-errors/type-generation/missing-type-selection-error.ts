import dedent from "ts-dedent";
import { CLICommandLineArgsError } from "../cli-command-line-args-error";
import { CLIError } from "../cli-error";

/**
 * Builds the human-readable message for missing type selection.
 *
 * @param envOpt - The env option name (CLI flag or API option).
 * @param runtimeOpt - The runtime option name (CLI flag or API option).
 * @returns The formatted error message string.
 */
function buildHumanMessage(envOpt: string, runtimeOpt: string): string {
	return `At least one of ${envOpt} or ${runtimeOpt} must be enabled. Use ${envOpt} to generate environment/binding types, or ${runtimeOpt} to generate Workers runtime types.`;
}

/**
 * Builds the AI-oriented message for missing type selection.
 *
 * @param envOpt - The env option name (CLI flag or API option).
 * @param runtimeOpt - The runtime option name (CLI flag or API option).
 * @returns The formatted AI error message string.
 */
function buildAiMessage(envOpt: string, runtimeOpt: string): string {
	return dedent`
		Error: No Type Generation Selected

		Both ${envOpt} and ${runtimeOpt} are disabled, but at least one must be enabled. "wrangler types" can generate two kinds of types: environment types (${envOpt}) for your Worker's bindings (KV, D1, R2, etc.) and runtime types (${runtimeOpt}) for the Workers runtime APIs. Both have been explicitly disabled, leaving nothing to generate.

		To resolve this, enable env types with ${envOpt}, enable runtime types with ${runtimeOpt}, or enable both (the default) by omitting both flags entirely.

		You may want to ask the human developer which types are needed: environment types, runtime types, or both.
	`;
}

/**
 * Thrown from CLI argument validation (`validateArgs`) when both
 * `--include-env` and `--include-runtime` are disabled. Extends
 * {@link CLICommandLineArgsError} so `handleError()` displays contextual
 * `--help` output.
 */
export class MissingTypeSelectionArgsError extends CLICommandLineArgsError {
	constructor() {
		super(
			buildHumanMessage("--include-env", "--include-runtime"),
			buildAiMessage("--include-env", "--include-runtime"),
			{
				telemetryMessage: "type generation args missing type selection",
			}
		);
	}
}

/**
 * Thrown from the programmatic API validation path when both `includeEnv`
 * and `includeRuntime` are disabled. Extends {@link CLIError} (no `--help`
 * display).
 */
export class MissingTypeSelectionError extends CLIError {
	/**
	 * @param source - Whether the caller is `"cli"` or `"api"`, to select
	 *   the appropriate option names in the error message.
	 */
	constructor(source: "cli" | "api") {
		const [envOpt, runtimeOpt] =
			source === "cli"
				? ["--include-env", "--include-runtime"]
				: ["includeEnv", "includeRuntime"];

		super(
			buildHumanMessage(envOpt, runtimeOpt),
			buildAiMessage(envOpt, runtimeOpt),
			{
				telemetryMessage: "type generation args missing type selection",
			}
		);
	}
}
