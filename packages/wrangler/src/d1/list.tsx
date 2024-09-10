import Table from "ink-table";
import { printWranglerBanner } from "..";
import { fetchResult } from "../cfetch";
import { defineCommand } from "../core";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import type { Database } from "./types";

defineCommand({
	command: "wrangler d1 list",

	metadata: {
		description: "List D1 databases",
		status: "stable",
		owner: "Product: D1",
	},

	args: {
		json: {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		},
	},

	async handler({ json }, { config }) {
		const accountId = await requireAuth(config);
		const dbs: Array<Database> = await listDatabases(accountId);

		if (json) {
			logger.log(JSON.stringify(dbs, null, 2));
		} else {
			await printWranglerBanner();
			logger.log(renderToString(<Table data={dbs}></Table>));
		}
	},
});

export const listDatabases = async (
	accountId: string
): Promise<Array<Database>> => {
	const pageSize = 10;
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
		if (json.length < pageSize) {
			break;
		}
	}
	return results;
};
