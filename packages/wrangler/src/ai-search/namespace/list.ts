import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listNamespaces } from "../client";

export const aiSearchNamespaceListCommand = createCommand({
	metadata: {
		description: "List all AI Search namespaces",
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
			describe: "Number of namespaces to show per page",
			type: "number",
		},
		search: {
			describe:
				"Filter namespaces whose name or description contains this string (case-insensitive).",
			type: "string",
		},
	},
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();
		urlParams.set("page", args.page.toString());
		if (args.perPage !== undefined) {
			urlParams.set("per_page", args.perPage.toString());
		}
		if (args.search !== undefined) {
			urlParams.set("search", args.search);
		}

		const namespaces = await listNamespaces(config, urlParams);

		if (args.json) {
			logger.log(JSON.stringify(namespaces, null, 2));
			return;
		}

		if (namespaces.length === 0 && args.page === 1) {
			logger.warn(
				`No AI Search namespaces found on this account.

Use 'wrangler ai-search namespace create <name>' to create one, or visit
https://developers.cloudflare.com/ai-search/ to get started.`
			);
			return;
		}

		if (namespaces.length === 0 && args.page > 1) {
			logger.warn(
				`No namespaces found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		logger.info(
			`Showing ${namespaces.length} namespace${namespaces.length !== 1 ? "s" : ""} from page ${args.page}:`
		);

		logger.table(
			namespaces.map((ns) => ({
				name: ns.name,
				description: ns.description ?? "",
				created: ns.created_at,
			}))
		);
	},
});
