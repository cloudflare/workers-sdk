import { updateConfigFile } from "../config";
import { createCommand } from "../core/create-command";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getValidBindingName } from "../utils/getValidBindingName";
import { createIndex } from "./client";
import { deprecatedV1DefaultFlag } from "./common";
import type { VectorizeDistanceMetric } from "./types";

export const vectorizeCreateCommand = createCommand({
	metadata: {
		description: "Create a Vectorize index",
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
			description:
				"The name of the Vectorize index to create (must be unique).",
		},
		dimensions: {
			type: "number",
			description:
				"The dimension size to configure this index for, based on the output dimensions of your ML model.",
		},
		metric: {
			type: "string",
			choices: ["euclidean", "cosine", "dot-product"],
			description: "The distance metric to use for searching within the index.",
		},
		preset: {
			type: "string",
			choices: [
				"@cf/baai/bge-small-en-v1.5",
				"@cf/baai/bge-base-en-v1.5",
				"@cf/baai/bge-large-en-v1.5",
				"openai/text-embedding-ada-002",
				"cohere/embed-multilingual-v2.0",
			],
			description:
				"The name of an preset representing an embeddings model: Vectorize will configure the dimensions and distance metric for you when provided.",
		},
		description: {
			type: "string",
			description: "An optional description for this index.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
		"deprecated-v1": {
			type: "boolean",
			deprecated: true,
			default: deprecatedV1DefaultFlag,
			description:
				"Create a deprecated Vectorize V1 index. This is not recommended and indexes created with this option need all other Vectorize operations to have this option enabled.",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		let indexConfig;
		if (args.preset) {
			indexConfig = { preset: args.preset };
			logger.log(
				`Configuring index based for the embedding model ${args.preset}.`
			);
		} else if (args.dimensions && args.metric) {
			// We let the server validate the supported (maximum) dimensions so that we
			// don't have to keep wrangler in sync with server-side changes
			indexConfig = {
				metric: args.metric as VectorizeDistanceMetric,
				dimensions: args.dimensions,
			};
		} else {
			throw new UserError(
				"🚨 You must provide both dimensions and a metric, or a known model preset when creating an index."
			);
		}

		if (args.deprecatedV1) {
			logger.warn(
				"Creation of legacy Vectorize indexes will be blocked by December 2024"
			);
		}

		const index = {
			name: args.name,
			description: args.description,
			config: indexConfig,
		};

		logger.log(`🚧 Creating index: '${args.name}'`);
		const indexResult = await createIndex(config, index, args.deprecatedV1);

		let bindingName: string;
		if (args.deprecatedV1) {
			bindingName = "VECTORIZE_INDEX";
		} else {
			bindingName = "VECTORIZE";
		}

		if (args.json) {
			logger.log(JSON.stringify(index, null, 2));
			return;
		}

		logger.log(
			`✅ Successfully created a new Vectorize index: '${indexResult.name}'`
		);

		await updateConfigFile(
			(name) => ({
				vectorize: [
					{
						binding: getValidBindingName(name ?? bindingName, bindingName),
						index_name: indexResult.name,
					},
				],
			}),
			config.configPath,
			args.env
		);
	},
});
