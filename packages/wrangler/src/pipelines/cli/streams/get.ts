import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { getStream } from "../../client";
import { displayStreamConfiguration } from "./utils";

export const pipelinesStreamsGetCommand = createCommand({
	metadata: {
		description: "Get details about a specific stream",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["stream"],
	args: {
		stream: {
			describe: "The ID of the stream to retrieve",
			type: "string",
			demandOption: true,
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		await requireAuth(config);

		const stream = await getStream(config, args.stream);

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
