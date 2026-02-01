import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getIndex } from "./client";
import { deprecatedV1DefaultFlag } from "./common";

export const vectorizeGetCommand = createCommand({
	metadata: {
		description: "Get a Vectorize index by name",
		status: "stable",
		owner: "Product: Vectorize",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
		"deprecated-v1": {
			type: "boolean",
			default: deprecatedV1DefaultFlag,
			description:
				"Fetch a deprecated V1 Vectorize index. This must be enabled if the index was created with V1 option.",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, json, deprecatedV1 }, { config }) {
		const index = await getIndex(config, name, deprecatedV1);

		if (json) {
			logger.log(JSON.stringify(index, null, 2));
			return;
		}

		logger.table([
			{
				name: index.name,
				dimensions: index.config?.dimensions.toString(),
				metric: index.config?.metric,
				description: index.description || "",
				created: index.created_on,
				modified: index.modified_on,
			},
		]);
	},
});
