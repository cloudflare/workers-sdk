import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when `wrangler types` cannot find a Wrangler configuration file.
 */
export class MissingConfigFileError extends CLIError {
	/**
	 * @param requestedConfig - The config path(s) the user requested, if any.
	 *   Used for error context.
	 */
	constructor(requestedConfig: string | string[] | undefined) {
		const location = requestedConfig ? ` (at ${requestedConfig})` : "";

		const humanMessage = `No config file detected${location}. This command requires a Wrangler configuration file.`;

		const aiMessage = dedent`
			Error: Missing Configuration File

			No Wrangler configuration file was found${location}. The "wrangler types" command requires a wrangler.json (or wrangler.jsonc / wrangler.toml) configuration file to generate TypeScript types for your Worker's bindings and runtime environment. No such file was detected in the current directory or at the specified path.

			To resolve this, create a wrangler.json file in the project root with at least "name" and "compatibility_date" fields. If the config file exists elsewhere, specify its path with wrangler types --config path/to/wrangler.json. Alternatively, run "wrangler init" to scaffold a new project with a config file.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation command missing config",
		});
	}
}
