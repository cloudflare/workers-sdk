import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import formatLabelledValues from "../../../utils/render-labelled-values";
import { getSink } from "../../client";
import { applyDefaultsToSink } from "../../defaults";
import { displaySinkConfiguration } from "./utils";

export const pipelinesSinksGetCommand = createCommand({
	metadata: {
		description: "Get details about a specific sink",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["sink"],
	args: {
		sink: {
			describe: "The ID of the sink to retrieve",
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

		const rawSink = await getSink(config, args.sink);

		if (args.json) {
			logger.json(rawSink);
			return;
		}

		const sink = applyDefaultsToSink(rawSink);

		logger.log(
			formatLabelledValues({
				ID: sink.id,
				Name: sink.name,
			})
		);

		displaySinkConfiguration(sink, "", { includeTimestamps: true });
	},
});
