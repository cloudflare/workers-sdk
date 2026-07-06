import dedent from "ts-dedent";
import { CLICommandLineArgsError } from "../cli-command-line-args-error";
import { CLIError } from "../cli-error";

/**
 * Builds the human-readable message for an invalid env-interface value.
 *
 * @param envInterface - The invalid value.
 * @param validInterfaceRegex - The RegExp used to validate the interface name.
 * @returns The formatted error message string.
 */
function buildHumanMessage(
	envInterface: string,
	validInterfaceRegex: RegExp
): string {
	return `The provided env-interface value ("${envInterface}") does not satisfy the validation regex: ${validInterfaceRegex}`;
}

/**
 * Builds the AI-oriented message for an invalid env-interface value.
 *
 * @param envInterface - The invalid value.
 * @param validInterfaceRegex - The RegExp used to validate the interface name.
 * @returns The formatted error message string.
 */
function buildAiMessage(
	envInterface: string,
	validInterfaceRegex: RegExp
): string {
	return dedent`
		Error: Invalid Env Interface Name

		The env-interface value "${envInterface}" is not a valid TypeScript identifier. The --env-interface option (or envInterface API option) specifies the name of the generated TypeScript interface for environment bindings. It must be a valid TypeScript identifier matching ${validInterfaceRegex}.

		To resolve this, use a valid identifier that starts with a letter, followed by letters, digits, or underscores (e.g. wrangler types --env-interface=MyEnv). If not specified, the default "Env" is used.

		You may want to ask the human developer what the environment interface should be named.
	`;
}

/**
 * Thrown from CLI argument validation (`validateArgs`) when the
 * `--env-interface` value is not a valid TypeScript identifier. Extends
 * {@link CLICommandLineArgsError} so `handleError()` displays contextual
 * `--help` output.
 */
export class InvalidEnvInterfaceArgsError extends CLICommandLineArgsError {
	/**
	 * @param envInterface - The invalid env-interface value.
	 * @param validInterfaceRegex - The RegExp used to validate the interface name.
	 */
	constructor(envInterface: string, validInterfaceRegexp: RegExp) {
		super(
			buildHumanMessage(envInterface, validInterfaceRegexp),
			buildAiMessage(envInterface, validInterfaceRegexp),
			{
				telemetryMessage: "type generation args invalid env interface",
			}
		);
	}
}

/**
 * Thrown from the programmatic API validation path when the `envInterface`
 * option is not a valid TypeScript identifier. Extends {@link CLIError}
 * (no `--help` display).
 */
export class InvalidEnvInterfaceError extends CLIError {
	/**
	 * @param envInterface - The invalid env-interface value.
	 * @param validInterfaceRegex - The RegExp used to validate the interface name.
	 */
	constructor(envInterface: string, validInterfaceRegex: RegExp) {
		super(
			buildHumanMessage(envInterface, validInterfaceRegex),
			buildAiMessage(envInterface, validInterfaceRegex),
			{
				telemetryMessage: "type generation args invalid env interface",
			}
		);
	}
}
