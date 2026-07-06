import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when an environment name converts to a reserved TypeScript interface
 * name (e.g. `"Env"`).
 */
export class ReservedInterfaceNameError extends CLIError {
	/**
	 * @param envName - The environment name from the configuration.
	 * @param interfaceName - The reserved interface name it converts to.
	 */
	constructor(envName: string, interfaceName: string) {
		const humanMessage =
			`Environment name "${envName}" converts to reserved interface name "${interfaceName}". ` +
			`Please rename this environment to avoid conflicts.`;

		const aiMessage = dedent`
			Error: Reserved Interface Name Conflict

			The environment name "${envName}" converts to the reserved interface name "${interfaceName}". When generating per-environment TypeScript types, Wrangler converts environment names to PascalCase interface names with an "Env" suffix. The name "${envName}" converts to "${interfaceName}", which is reserved for the default environment interface.

			To resolve this, rename the "${envName}" environment in wrangler.json to something that does not conflict (e.g. "production", "staging", "dev", or any other descriptive name).

			You may want to ask the human developer what the "${envName}" environment should be renamed to.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation environment interface reserved",
		});
	}
}
