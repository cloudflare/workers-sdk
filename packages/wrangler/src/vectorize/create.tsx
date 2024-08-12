import { stringify } from "@iarna/toml";
import { readConfig } from "../config";
import { logger } from "../logger";
import { createIndex } from "./client";
import { deprecatedV1DefaultFlag, vectorizeBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { VectorizeDistanceMetric } from "./types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description:
				"The name of the Vectorize index to create (must be unique).",
		})
		.options({
			dimensions: {
				type: "number",
				describe:
					"The dimension size to configure this index for, based on the output dimensions of your ML model.",
			},
		})
		.options({
			metric: {
				type: "string",
				choices: ["euclidean", "cosine", "dot-product"],
				describe: "The distance metric to use for searching within the index.",
			},
		})
		.options({
			preset: {
				type: "string",
				choices: [
					"@cf/baai/bge-small-en-v1.5",
					"@cf/baai/bge-base-en-v1.5",
					"@cf/baai/bge-large-en-v1.5",
					"openai/text-embedding-ada-002",
					"cohere/embed-multilingual-v2.0",
				],
				describe:
					"The name of an preset representing an embeddings model: Vectorize will configure the dimensions and distance metric for you when provided.",
			},
		})
		.options({
			description: {
				type: "string",
				describe: "An optional description for this index.",
			},
		})
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.option("deprecated-v1", {
			type: "boolean",
			default: deprecatedV1DefaultFlag,
			describe:
				"Create a deprecated Vectorize V1 index. This is not recommended and indexes created with this option need all other Vectorize operations to have this option enabled.",
		})
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

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
		logger.error(
			"You must provide both dimensions and a metric, or a known model preset when creating an index."
		);
		return;
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
	logger.log(
		`📋 To start querying from a Worker, add the following binding configuration into 'wrangler.toml':\n`
	);
	logger.log(
		stringify({
			vectorize: [
				{
					binding: bindingName,
					index_name: indexResult.name,
				},
			],
		})
	);
}
