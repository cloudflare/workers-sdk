import dedent from "ts-dedent";
import { CLICommandLineArgsError } from "../cli-command-line-args-error";

/**
 * Thrown when the user passes the deprecated `--experimental-include-runtime`
 * (or `--x-include-runtime`) flag, which has been superseded by the built-in
 * runtime type generation in `wrangler types`.
 */
export class DeprecatedIncludeRuntimeError extends CLICommandLineArgsError {
	constructor() {
		const humanMessage =
			"You no longer need to use --experimental-include-runtime.\n" +
			"`wrangler types` will now generate runtime types in the same file as the Env types.\n" +
			"You should delete the old runtime types file, and remove it from your tsconfig.json.\n" +
			"Then rerun `wrangler types`.";

		const aiMessage = dedent`
			Error: Deprecated Flag --experimental-include-runtime

			The --experimental-include-runtime (or --x-include-runtime) flag is no longer needed. "wrangler types" now generates both Env types and runtime types in a single output file by default.

			To resolve this, remove the --experimental-include-runtime flag from the command, delete the old separate runtime types file (if it exists), remove any reference to it from tsconfig.json, and re-run "wrangler types" without the deprecated flag.

			You may want to ask the human developer whether there is an old runtime types file that should be deleted, and whether tsconfig.json references it.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation args include runtime deprecated",
		});
	}
}
