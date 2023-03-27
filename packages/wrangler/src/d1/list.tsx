import Table from "ink-table";
import React from "react";
import { fetchResult } from "../cfetch";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import { d1BetaWarning } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Database } from "./types";

export function Options(d1ListYargs: CommonYargsArgv) {
	return d1ListYargs
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.epilogue(d1BetaWarning);
}

export async function Handler({
	json,
}: StrictYargsOptionsToInterface<typeof Options>): Promise<void> {
	const accountId = await requireAuth({});
	const dbs: Array<Database> = await listDatabases(accountId);

	if (json) {
		logger.log(JSON.stringify(dbs, null, 2));
	} else {
		logger.log(d1BetaWarning);
		logger.log(renderToString(<Table data={dbs}></Table>));
	}
}

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
