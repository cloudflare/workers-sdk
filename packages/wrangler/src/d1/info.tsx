import Table from "ink-table";
import prettyBytes from "pretty-bytes";
import React from "react";
import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import { d1BetaWarning, getDatabaseByNameOrBinding } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Database } from "./types";

export function Options(d1ListYargs: CommonYargsArgv) {
	return d1ListYargs
		.positional("name", {
			describe: "The name of the DB",
			type: "string",
			demandOption: true,
		})
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.epilogue(d1BetaWarning);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;
export const Handler = withConfig<HandlerOptions>(
	async ({ name, config, json }): Promise<void> => {
		const accountId = await requireAuth(config);
		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		const result = await fetchResult<Record<string, string>>(
			`/accounts/${accountId}/d1/database/${db.uuid}`,
			{
				headers: {
					"Content-Type": "application/json",
				},
			}
		);
		if (json) {
			logger.log(JSON.stringify(result, null, 2));
		} else {
			// Snip off the "uuid" property from the response and use those as the header

			const entries = Object.entries(result).filter(([k, _v]) => k !== "uuid");
			const data = entries.map(([k, v]) => ({
				[db.binding || ""]: k,
				[db.uuid]: k === "file_size" ? prettyBytes(Number(v)) : v,
			}));

			logger.log(renderToString(<Table data={data} />));
		}
	}
);
