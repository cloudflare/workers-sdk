import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { updateInstance } from "./client";

export const aiSearchUpdateCommand = createCommand({
	metadata: {
		description: "Update an AI Search instance configuration",
		status: "open beta",
		owner: "Product: AI Search",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the AI Search instance to update.",
		},
		"embedding-model": {
			type: "string",
			description: "Update the embedding model.",
		},
		"generation-model": {
			type: "string",
			description: "Update the LLM model for chat completions.",
		},
		"chunk-size": {
			type: "number",
			description: "Update the chunk size.",
		},
		"chunk-overlap": {
			type: "number",
			description: "Update the chunk overlap.",
		},
		"max-num-results": {
			type: "number",
			description: "Update max search results per query.",
		},
		reranking: {
			type: "boolean",
			description: "Enable or disable reranking.",
		},
		"reranking-model": {
			type: "string",
			description: "Update the reranking model.",
		},
		"hybrid-search": {
			type: "boolean",
			description: "Enable or disable hybrid search.",
		},
		cache: {
			type: "boolean",
			description: "Enable or disable caching.",
		},
		"score-threshold": {
			type: "number",
			description: "Update the minimum relevance score threshold (0-1).",
		},
		paused: {
			type: "boolean",
			description: "Pause or resume the instance.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const body: Record<string, unknown> = {};

		if (args.embeddingModel !== undefined) {
			body.embedding_model = args.embeddingModel;
		}
		if (args.generationModel !== undefined) {
			body.ai_search_model = args.generationModel;
		}
		if (args.chunkSize !== undefined) {
			body.chunk_size = args.chunkSize;
		}
		if (args.chunkOverlap !== undefined) {
			body.chunk_overlap = args.chunkOverlap;
		}
		if (args.maxNumResults !== undefined) {
			body.max_num_results = args.maxNumResults;
		}
		if (args.reranking !== undefined) {
			body.reranking = args.reranking;
		}
		if (args.rerankingModel !== undefined) {
			body.reranking_model = args.rerankingModel;
		}
		if (args.hybridSearch !== undefined) {
			body.hybrid_search_enabled = args.hybridSearch;
		}
		if (args.cache !== undefined) {
			body.cache = args.cache;
		}
		if (args.scoreThreshold !== undefined) {
			body.score_threshold = args.scoreThreshold;
		}
		if (args.paused !== undefined) {
			body.paused = args.paused;
		}

		if (Object.keys(body).length === 0) {
			throw new UserError(
				"No fields to update. Provide at least one flag (e.g. --paused, --cache)."
			);
		}

		if (!args.json) {
			logger.log(`Updating AI Search instance "${args.name}"...`);
		}
		const instance = await updateInstance(config, args.name, body);

		if (args.json) {
			logger.log(JSON.stringify(instance, null, 2));
			return;
		}

		logger.log(`Successfully updated AI Search instance "${instance.id}"`);
	},
});
