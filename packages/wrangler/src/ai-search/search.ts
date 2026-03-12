import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { searchInstance } from "./client";
import { parseFilters } from "./utils";
import type { AiSearchMessage } from "./types";

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

		const body: {
			messages: AiSearchMessage[];
			filters?: Record<string, string>;
			max_num_results?: number;
			score_threshold?: number;
			reranking?: boolean;
		} = { messages, filters };
		if (args.maxNumResults !== undefined) {
			body.max_num_results = args.maxNumResults;
		}
		if (args.scoreThreshold !== undefined) {
			body.score_threshold = args.scoreThreshold;
		}
		if (args.reranking !== undefined) {
			body.reranking = args.reranking;
		}
		const result = await searchInstance(config, args.name, body);

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
