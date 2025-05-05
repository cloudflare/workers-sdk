import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import type { Database } from "./types";

export const d1ListCommand = createCommand({
	metadata: {
		description: "List D1 databases",
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			description: "Return output as clean JSON",
			default: false,
		},
	},
	async handler({ json }, { config }) {
		const accountId = await requireAuth(config);
		const dbs: Array<Database> = await listDatabases(accountId);

		if (json) {
			logger.log(JSON.stringify(dbs, null, 2));
		} else {
			logger.table(
				dbs.map((db) =>
					Object.fromEntries(
						Object.entries(db).map(([k, v]) => [k, String(v ?? "")])
					)
				)
			);
		}
	},
});

export const listDatabases = async (
	accountId: string,
	limitCalls: boolean = false,
	pageSize: number = 10
): Promise<Array<Database>> => {
	let page = 1;
	const results = [];
	while (results.length % pageSize === 0) {
		const json: Array<Database> = await fetchResult(
			`/accounts/${accountId}/d1/database`,
			{},
			new URLSearchParams({
				per_page: pageSize.toString(),
				page: page.toString(),
			})
		);
		page++;
		results.push(...json);
		if (limitCalls && page > 3) {
			break;
		}
		if (json.length < pageSize) {
			break;
		}
	}
	return results;
};
