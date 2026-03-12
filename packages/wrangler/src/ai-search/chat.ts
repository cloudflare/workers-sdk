import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { chatCompletions } from "./client";
import { parseFilters } from "./search";
import type { AiSearchMessage } from "./types";

export const aiSearchChatCommand = createCommand({
	metadata: {
		description: "Perform a RAG chat completion using an AI Search instance",
		status: "open beta",
		owner: "Product: AI",
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
			description: "The user message/question.",
		},
		model: {
			type: "string",
			description: "Override the LLM model.",
		},
		"system-prompt": {
			type: "string",
			description: "System prompt to prepend.",
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
		const messages: AiSearchMessage[] = [];

		if (args.systemPrompt) {
			messages.push({ role: "system", content: args.systemPrompt });
		}
		messages.push({ role: "user", content: args.query });

		const filterStrings = args.filter?.map(String);
		const filters = parseFilters(filterStrings);

		const result = await chatCompletions(config, args.name, {
			messages,
			model: args.model,
			filters,
		});

		if (args.json) {
			logger.log(JSON.stringify(result, null, 2));
			return;
		}

		// Print the generated answer
		const answer = result.choices?.[0]?.message?.content;
		if (answer) {
			logger.log(answer);
		} else {
			logger.log("(No response generated)");
		}

		// Print sources footer
		if (result.chunks && result.chunks.length > 0) {
			logger.log("\n-- Sources " + "-".repeat(40));
			for (let i = 0; i < result.chunks.length; i++) {
				const chunk = result.chunks[i];
				logger.log(
					` ${i + 1}. ${chunk.item?.key ?? chunk.id} (score: ${chunk.score.toFixed(2)})`
				);
			}
		}
	},
});
