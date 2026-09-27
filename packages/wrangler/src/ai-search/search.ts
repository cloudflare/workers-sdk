import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { DEFAULT_NAMESPACE, searchInstance } from "./client";
import { parseFilters } from "./utils";
import type {
	AiSearchMessage,
	AiSearchSearchOptions,
	AiSearchSearchRequest,
	AiSearchSearchRetrievalOptions,
} from "./types";

export const aiSearchSearchCommand = createCommand({
	metadata: {
		description:
			"Execute a semantic search query against an AI Search instance",
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
			description: "The name of the AI Search instance.",
		},
		namespace: {
			type: "string",
			alias: "n",
			default: DEFAULT_NAMESPACE,
			description: "The namespace the instance belongs to.",
		},
		query: {
			type: "string",
			demandOption: true,
			description: "The search query text.",
		},
		"max-num-results": {
			type: "number",
			description: "Override maximum number of results.",
		},
		"score-threshold": {
			type: "number",
			description: "Override minimum relevance score (0-1).",
		},
		reranking: {
			type: "boolean",
			description: "Override reranking setting.",
		},
		filter: {
			type: "array",
			string: true,
			description:
				"Metadata filter as key=value (repeatable, e.g. --filter type=docs --filter lang=en).",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const messages: AiSearchMessage[] = [{ role: "user", content: args.query }];

		const filterStrings = args.filter?.map(String);
		const filters = parseFilters(filterStrings);

		const retrieval: AiSearchSearchRetrievalOptions = {};
		if (filters !== undefined) {
			retrieval.filters = filters;
		}
		if (args.maxNumResults !== undefined) {
			retrieval.max_num_results = args.maxNumResults;
		}
		if (args.scoreThreshold !== undefined) {
			retrieval.match_threshold = args.scoreThreshold;
		}

		const aiSearchOptions: AiSearchSearchOptions = {};
		if (Object.keys(retrieval).length > 0) {
			aiSearchOptions.retrieval = retrieval;
		}
		if (args.reranking !== undefined) {
			aiSearchOptions.reranking = { enabled: args.reranking };
		}

		const body: AiSearchSearchRequest = { messages };
		if (Object.keys(aiSearchOptions).length > 0) {
			body.ai_search_options = aiSearchOptions;
		}
		const result = await searchInstance(
			config,
			args.namespace,
			args.name,
			body
		);

		if (args.json) {
			logger.log(JSON.stringify(result, null, 2));
			return;
		}

		logger.log(
			`Search query: "${result.search_query}"  (${result.chunks.length} results)\n`
		);

		if (result.chunks.length === 0) {
			logger.log("No results found.");
			return;
		}

		logger.table(
			result.chunks.map((chunk, i) => ({
				"#": String(i + 1),
				score: chunk.score.toFixed(4),
				key: chunk.item?.key ?? "",
				text:
					chunk.text.length > 80 ? chunk.text.slice(0, 80) + "..." : chunk.text,
				type: chunk.type,
			}))
		);
	},
});
