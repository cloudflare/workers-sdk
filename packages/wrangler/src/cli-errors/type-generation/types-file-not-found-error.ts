import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when `wrangler types --check` cannot find the generated types file
 * at the expected path.
 */
export class TypesFileNotFoundError extends CLIError {
	/**
	 * @param typesPath - The file path that was checked.
	 */
	constructor(typesPath: string) {
		const humanMessage = `Types file not found at ${typesPath}.`;

		const aiMessage = dedent`
			Error: Types File Not Found

			The generated types file was not found at "${typesPath}". "wrangler types --check" expects a previously generated types file at the specified path so it can compare it against the current configuration, but the file does not exist.

			To resolve this, run "wrangler types" first to generate the types file. If the types file is at a different location, specify it with wrangler types --check ${typesPath}. Also ensure the file was not deleted or moved.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation check types file missing",
		});
	}
}
