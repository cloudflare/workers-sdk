import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listInstances } from "./client";

export const aiSearchListCommand = createCommand({
	metadata: {
		description: "List all AI Search instances",
		status: "open beta",
		owner: "Product: AI Search",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
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
			describe: "Number of instances to show per page",
			type: "number",
		},
	},
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();
		urlParams.set("page", args.page.toString());
		if (args.perPage !== undefined) {
			urlParams.set("per_page", args.perPage.toString());
		}

		const instances = await listInstances(config, urlParams);

		if (args.json) {
			logger.log(JSON.stringify(instances, null, 2));
			return;
		}

		if (instances.length === 0 && args.page === 1) {
			logger.warn(`You haven't created any AI Search instances on this account.

Use 'wrangler ai-search create <name>' to create one, or visit
https://developers.cloudflare.com/ai-search/ to get started.`);
			return;
		}

		if (instances.length === 0 && args.page > 1) {
			logger.warn(
				`No instances found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		logger.info(
			`Showing ${instances.length} instance${instances.length !== 1 ? "s" : ""} from page ${args.page}:`
		);

		logger.table(
			instances.map((instance) => ({
				name: instance.id,
				type: instance.type,
				status: instance.status ?? "",
				source: instance.source,
				created: instance.created_at,
			}))
		);
	},
});
