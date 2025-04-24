import prettyBytes from "pretty-bytes";
import { fetchGraphqlResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import {
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromIdOrName,
} from "./utils";
import type { D1MetricsGraphQLResponse, Database } from "./types";

export const d1InfoCommand = createCommand({
	metadata: {
		description:
			"Get information about a D1 database, including the current database size and state",
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the DB",
		},
		json: {
			type: "boolean",
			description: "Return output as clean JSON",
			default: false,
		},
	},
	positionalArgs: ["name"],
	async handler({ name, json }, { config }) {
		const accountId = await requireAuth(config);
		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		const result = await getDatabaseInfoFromIdOrName(accountId, db.uuid);

		const output: Record<string, string | number> = { ...result };
		if (output["file_size"]) {
			output["database_size"] = output["file_size"];
			delete output["file_size"];
		}
		if (output["version"] !== "alpha") {
			delete output["version"];
		}
		if (result.version !== "alpha") {
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
												rowsRead
												rowsWritten
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

			const metrics = {
				readQueries: 0,
				writeQueries: 0,
				rowsRead: 0,
				rowsWritten: 0,
			};
			if (graphqlResult) {
				graphqlResult.data?.viewer?.accounts[0]?.d1AnalyticsAdaptiveGroups?.forEach(
					(row) => {
						metrics.readQueries += row?.sum?.readQueries ?? 0;
						metrics.writeQueries += row?.sum?.writeQueries ?? 0;
						metrics.rowsRead += row?.sum?.rowsRead ?? 0;
						metrics.rowsWritten += row?.sum?.rowsWritten ?? 0;
					}
				);
				output.read_queries_24h = metrics.readQueries;
				output.write_queries_24h = metrics.writeQueries;
				output.rows_read_24h = metrics.rowsRead;
				output.rows_written_24h = metrics.rowsWritten;
			}
		}

		if (json) {
			logger.log(JSON.stringify(output, null, 2));
		} else {
			// Snip off the "uuid" property from the response and use those as the header
			const entries = Object.entries(output).filter(
				// also remove any version that isn't "alpha"
				([k, v]) => k !== "uuid" && !(k === "version" && v !== "alpha")
			);
			const data = entries.map(([k, v]) => {
				let value;
				if (k === "database_size") {
					value = prettyBytes(Number(v));
				} else if (
					k === "read_queries_24h" ||
					k === "write_queries_24h" ||
					k === "rows_read_24h" ||
					k === "rows_written_24h"
				) {
					value = v.toLocaleString();
				} else {
					value = String(v);
				}
				return {
					[db.binding || ""]: k,
					[db.uuid]: value,
				};
			});

			logger.table(data);
		}
	},
});
