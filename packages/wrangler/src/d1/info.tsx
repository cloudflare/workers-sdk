import Table from "ink-table";
import prettyBytes from "pretty-bytes";
import React from "react";
import { fetchGraphqlResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import {
	d1BetaWarning,
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromId,
} from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { D1MetricsGraphQLResponse, Database } from "./types";

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

		const result = await getDatabaseInfoFromId(accountId, db.uuid);

		const output: Record<string, string | number> = { ...result };
		if (output["file_size"]) {
			output["database_size"] = output["file_size"];
			delete output["file_size"];
		}
		if (result.version === "beta") {
			const today = new Date();
			const yesterday = new Date(new Date(today).setDate(today.getDate() - 1));

			const graphqlResult = await fetchGraphqlResult<D1MetricsGraphQLResponse>({
				method: "POST",
				body: JSON.stringify({
					query: `query getD1MetricsOverviewQuery($accountTag: string, $filter: ZoneWorkersRequestsFilter_InputObject) {
								viewer {
									accounts(filter: {accountTag: $accountTag}) {
										d1AnalyticsAdaptiveGroups(limit: 10000, filter: $filter) {
											sum {
												readQueries
												writeQueries
										}
										dimensions {
												datetimeHour
										}
									}
								}
							}
						}`,
					operationName: "getD1MetricsOverviewQuery",
					variables: {
						accountTag: accountId,
						filter: {
							AND: [
								{
									datetimeHour_geq: yesterday.toISOString(),
									datetimeHour_leq: today.toISOString(),
									databaseId: db.uuid,
								},
							],
						},
					},
				}),
				headers: {
					"Content-Type": "application/json",
				},
			});

			const metrics = { readQueries: 0, writeQueries: 0 };
			if (graphqlResult) {
				graphqlResult.data?.viewer?.accounts[0]?.d1AnalyticsAdaptiveGroups?.forEach(
					(row) => {
						metrics.readQueries += row?.sum?.readQueries ?? 0;
						metrics.writeQueries += row?.sum?.writeQueries ?? 0;
					}
				);
				output.read_queries_24h = metrics.readQueries;
				output.write_queries_24h = metrics.writeQueries;
			}
		}

		if (json) {
			logger.log(JSON.stringify(output, null, 2));
		} else {
			// Snip off the "uuid" property from the response and use those as the header

			const entries = Object.entries(output).filter(([k, _v]) => k !== "uuid");
			const data = entries.map(([k, v]) => {
				let value;
				if (k === "database_size") {
					value = prettyBytes(Number(v));
				} else if (k === "read_queries_24h" || k === "write_queries_24h") {
					value = v.toLocaleString();
				} else {
					value = v;
				}
				return {
					[db.binding || ""]: k,
					[db.uuid]: value,
				};
			});

			logger.log(renderToString(<Table data={data} />));
		}
	}
);
