import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listItemChunks } from "../client";

export const aiSearchItemsChunksCommand = createCommand({
	metadata: {
		description: "List chunks for a specific item in an AI Search instance",
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
		"item-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the item to list chunks for.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
		page: {
			describe:
				'Page number of the results, can configure page size using "per-page"',
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of chunks to show per page",
			type: "number",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();
		urlParams.set("page", args.page.toString());
		if (args.perPage !== undefined) {
			urlParams.set("per_page", args.perPage.toString());
		}

		const chunks = await listItemChunks(
			config,
			args.name,
			args.itemId,
			urlParams
		);

		if (chunks.length === 0 && args.page === 1) {
			logger.warn("No chunks found for this item.");
			return;
		}

		if (chunks.length === 0 && args.page > 1) {
			logger.warn(
				`No chunks found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		if (args.json) {
			logger.log(JSON.stringify(chunks, null, 2));
			return;
		}

		const MAX_TEXT_LENGTH = 80;
		logger.info(
			`Showing ${chunks.length} chunk${chunks.length !== 1 ? "s" : ""} from page ${args.page}:`
		);

		logger.table(
			chunks.map((chunk) => ({
				id: chunk.id,
				text:
					chunk.text.length > MAX_TEXT_LENGTH
						? chunk.text.substring(0, MAX_TEXT_LENGTH) + "..."
						: chunk.text,
				start_byte: chunk.start_byte != null ? String(chunk.start_byte) : "",
				end_byte: chunk.end_byte != null ? String(chunk.end_byte) : "",
				item_key: chunk.item.key,
			}))
		);
	},
});
