import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { resolveStream } from "../resolve";
import { displayStreamConfiguration } from "./utils";

export const pipelinesStreamsGetCommand = createCommand({
	metadata: {
		description: "Get details about a specific stream",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	behaviour: {
		printBanner: (args) => !args.json && !args.exportSchema,
	},
	positionalArgs: ["stream"],
	args: {
		stream: {
			describe: "The ID or name of the stream to retrieve",
			type: "string",
			demandOption: true,
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
		"export-schema": {
			describe:
				"Output only the stream schema in a format compatible with --schema-file",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		await requireAuth(config);

		const stream = await resolveStream(config, args.stream);

		if (args.exportSchema) {
			if (stream.schema) {
				logger.json(stream.schema);
			} else {
				logger.log(
					"This stream has no schema (unstructured JSON). There is no schema to export."
				);
			}
			return;
		}

		if (args.json) {
			logger.json(stream);
			return;
		}

		logger.log(`Stream ID: ${stream.id}`);

		displayStreamConfiguration(stream, undefined, {
			includeTimestamps: true,
		});
	},
});
