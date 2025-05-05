import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { getPipeline } from "../client";
import { formatPipelinePretty } from "../index";
import { validateName } from "../validate";

export const pipelinesGetCommand = createCommand({
	metadata: {
		description: "Get a pipeline's configuration",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
	args: {
		pipeline: {
			type: "string",
			describe: "The name of the pipeline to inspect",
			demandOption: true,
		},
		format: {
			choices: ["pretty", "json"],
			describe: "The output format for pipeline",
			default: "pretty",
		},
	},
	positionalArgs: ["pipeline"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const name = args.pipeline;

		validateName("pipeline name", name);

		const pipeline = await getPipeline(accountId, name);

		switch (args.format) {
			case "json":
				logger.log(JSON.stringify(pipeline, null, 2));
				break;
			case "pretty":
				logger.log(formatPipelinePretty(pipeline));
				break;
		}
	},
});
