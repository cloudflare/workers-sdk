import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when the types file exists but does not contain any Wrangler-generated
 * type headers (neither Env types nor runtime types).
 */
export class NoGeneratedTypesError extends CLIError {
	/**
	 * @param typesPath - The file path that was inspected.
	 */
	constructor(typesPath: string) {
		const humanMessage = `No generated types found in ${typesPath}.`;

		const aiMessage = dedent`
			Error: No Generated Types Found

			The file at "${typesPath}" exists but does not contain any Wrangler generated types. "wrangler types --check" found the file but could not locate the expected header comments that Wrangler inserts when generating types. This usually means the file was not created by "wrangler types", or its header was removed.

			To resolve this, re-run "wrangler types" to regenerate the file with proper headers. If "${typesPath}" is not the correct file, specify the right path with wrangler types <path>. Also check if the file was manually edited and the header comments were removed.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation check generated types missing",
		});
	}
}
