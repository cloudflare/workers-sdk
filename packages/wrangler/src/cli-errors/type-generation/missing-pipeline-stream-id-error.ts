import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when a pipeline binding in the Wrangler configuration is missing
 * both the `stream` and `pipeline` (legacy) properties that identify the
 * pipeline stream.
 */
export class MissingPipelineStreamIdError extends CLIError {
	/**
	 * @param bindingName - The name of the pipeline binding that is missing
	 *   a stream ID.
	 */
	constructor(bindingName: string) {
		const humanMessage = `Pipeline binding ${bindingName} is missing the stream ID`;

		const aiMessage = dedent`
			Error: Missing Pipeline Stream ID

			The pipeline binding "${bindingName}" does not have a "stream" (or legacy "pipeline") property. Each pipeline binding needs a "stream" property that identifies the pipeline stream to fetch the schema from. Without it, Wrangler cannot generate accurate types for this binding.

			To resolve this, add a "stream" property to the pipeline binding in wrangler.json, e.g. { "binding": "${bindingName}", "stream": "<your-stream-id>" }. The stream ID can be found in the Cloudflare dashboard under Workers > Pipelines.

			You may want to ask the human developer what the stream ID for the "${bindingName}" pipeline binding is.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation pipeline missing stream id",
		});
	}
}
