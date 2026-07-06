import { CLIError } from "./cli-error";
import type { CLIErrorOptions } from "./cli-error";

/**
 * Abstract base for CLI argument-validation errors that provide dual
 * human/AI messaging **and** preserve the help-text display behavior
 * of {@link import("@cloudflare/workers-utils").CommandLineArgsError}.
 *
 * `handleError()` uses an `instanceof CLICommandLineArgsError` check to
 * re-parse the command with `--help`, exactly as it does for the legacy
 * `CommandLineArgsError`.
 *
 * Concrete subclasses live alongside the other CLI error classes (e.g. in
 * `cli-errors/type-generation/`) and must supply both a human-readable
 * and an AI-optimized error message.
 */
export abstract class CLICommandLineArgsError extends CLIError {
	/**
	 * @param humanMessage - The concise, human-readable error message.
	 * @param aiMessage - The verbose, error message intended for AI agents.
	 * @param options - Configuration for telemetry, exit code, and
	 *   user-error classification.
	 */
	constructor(
		humanMessage: string,
		aiMessage: string,
		options: CLIErrorOptions
	) {
		super(humanMessage, aiMessage, options);
	}
}
