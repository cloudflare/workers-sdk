import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown by `wrangler types --check` when the generated types file is stale
 * compared to the current configuration. Carries an {@link CLIError.exitCode}
 * of `1` so CI pipelines can detect the failure via the process exit code.
 */
export class TypesOutOfDateError extends CLIError {
	/**
	 * @param outputPath - The path to the stale types file.
	 */
	constructor(outputPath: string) {
		const humanMessage = `Types at ${outputPath} are out of date. Run \`wrangler types\` to regenerate.`;

		const aiMessage = dedent`
			Error: Types Out of Date

			The generated types at "${outputPath}" are stale. "wrangler types --check" compared the generated types file against the current Wrangler configuration and found differences. This means the bindings, compatibility date, or compatibility flags have changed since the types were last generated.

			Run "wrangler types" to regenerate the types file.
		`;

		super(humanMessage, aiMessage, {
			exitCode: 1,
			telemetryMessage: "type generation check types out of date",
		});
	}
}
