import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when the Wrangler configuration is missing a `compatibility_date`
 * field, which is required for generating runtime types.
 */
export class MissingCompatibilityDateError extends CLIError {
	constructor() {
		const humanMessage = "Config must have a compatibility date.";

		const aiMessage = dedent`
			Error: Missing Compatibility Date

			The Wrangler configuration does not include a "compatibility_date" field. The "wrangler types" command needs a "compatibility_date" to determine which Workers runtime APIs are available. Without it, runtime types cannot be generated.

			To resolve this, add a "compatibility_date" field to wrangler.json set to the current date, e.g. "compatibility_date": "2026-01-01".
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation config missing compatibility date",
		});
	}
}
