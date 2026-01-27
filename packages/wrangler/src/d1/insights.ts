import { fetchGraphqlResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import {
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromIdOrName,
} from "./utils";
import type { D1QueriesGraphQLResponse, Database } from "./types";

const cliOptionToGraphQLOption = {
	time: "queryDurationMs",
	reads: "rowsRead",
	writes: "rowsWritten",
	count: "count",
};

export function getDurationDates(durationString: string) {
	const endDate = new Date();

	const durationValue = parseInt(durationString.slice(0, -1));
	const durationUnit = durationString.slice(-1);

	let startDate;
	switch (durationUnit) {
		case "d":
			if (durationValue > 31) {
				throw new Error("Duration cannot be greater than 31 days");
			}
			startDate = new Date(
				endDate.getTime() - durationValue * 24 * 60 * 60 * 1000
			);
			break;
		case "m":
			if (durationValue > 31 * 24 * 60) {
				throw new Error(
					`Duration cannot be greater than ${31 * 24 * 60} minutes (31 days)`
				);
			}
			startDate = new Date(endDate.getTime() - durationValue * 60 * 1000);
			break;
		case "h":
			if (durationValue > 31 * 24) {
				throw new Error(
					`Duration cannot be greater than ${31 * 24} hours (31 days)`
				);
			}
			startDate = new Date(endDate.getTime() - durationValue * 60 * 60 * 1000);
			break;
		default:
			throw new Error("Invalid duration unit");
	}

	return [startDate.toISOString(), endDate.toISOString()];
}

export const d1InsightsCommand = createCommand({
	metadata: {
		description: "Get information about the queries run on a D1 database",
		epilogue: "This command acts on remote D1 Databases.",
		status: "experimental",
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
		"time-period": {
			type: "string",
			description: "Fetch data from now to the provided time period",
			default: "1d",
		},
		"sort-type": {
			type: "string",
			description: "Choose the operation you want to sort insights by",
			choices: ["sum", "avg"] as const,
			default: "sum",
		},
		"sort-by": {
			type: "string",
			description: "Choose the field you want to sort insights by",
			choices: ["time", "reads", "writes", "count"] as const,
			default: "time" as const,
		},
		"sort-direction": {
			type: "string",
			description: "Choose a sort direction",
			choices: ["ASC", "DESC"] as const,
			default: "DESC",
		},
		limit: {
			type: "number",
			description: "fetch insights about the first X queries",
			default: 5,
		},
		count: {
			type: "number",
			description: "Same as --limit",
			default: 5,
			deprecated: true,
			hidden: true,
		},
		json: {
			type: "boolean",
			description: "return output as clean JSON",
			default: false,
		},
	},
	positionalArgs: ["name"],
	async handler(
		{ name, json, limit, timePeriod, sortType, sortBy, sortDirection },
		{ config }
	) {
		const accountId = await requireAuth(config);
		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		const result = await getDatabaseInfoFromIdOrName(
			config,
			accountId,
			db.uuid
		);

		const output: Record<string, string | number>[] = [];

		if (result.version !== "alpha") {
			const [startDate, endDate] = getDurationDates(timePeriod);
			const parsedSortBy = cliOptionToGraphQLOption[sortBy];
			const orderByClause =
				parsedSortBy === "count"
					? `${parsedSortBy}_${sortDirection}`
					: `${sortType}_${parsedSortBy}_${sortDirection}`;
			const graphqlQueriesResult =
				await fetchGraphqlResult<D1QueriesGraphQLResponse>(config, {
					method: "POST",
					body: JSON.stringify({
						query: `query getD1QueriesOverviewQuery($accountTag: string, $filter: ZoneWorkersRequestsFilter_InputObject) {
								viewer {
									accounts(filter: {accountTag: $accountTag}) {
										d1QueriesAdaptiveGroups(limit: ${limit}, filter: $filter, orderBy: [${orderByClause}]) {
											sum {
												queryDurationMs
												rowsRead
												rowsWritten
												rowsReturned
											}
											avg {
												queryDurationMs
												rowsRead
												rowsWritten
												rowsReturned
											}
											count
											dimensions {
													query
											}
										}
									}
								}
							}`,
						operationName: "getD1QueriesOverviewQuery",
						variables: {
							accountTag: accountId,
							filter: {
								AND: [
									{
										datetimeHour_geq: startDate,
										datetimeHour_leq: endDate,
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

			graphqlQueriesResult?.data?.viewer?.accounts[0]?.d1QueriesAdaptiveGroups?.forEach(
				(row) => {
					if (!row.dimensions.query) {
						return;
					}
					output.push({
						query: row.dimensions.query,
						avgRowsRead: row?.avg?.rowsRead ?? 0,
						totalRowsRead: row?.sum?.rowsRead ?? 0,
						avgRowsWritten: row?.avg?.rowsWritten ?? 0,
						totalRowsWritten: row?.sum?.rowsWritten ?? 0,
						avgDurationMs: row?.avg?.queryDurationMs ?? 0,
						totalDurationMs: row?.sum?.queryDurationMs ?? 0,
						numberOfTimesRun: row?.count ?? 0,
						queryEfficiency:
							row?.avg?.rowsReturned && row?.avg?.rowsRead
								? row?.avg?.rowsReturned / row?.avg?.rowsRead
								: 0,
					});
				}
			);
		}

		if (json) {
			logger.log(JSON.stringify(output, null, 2));
		} else {
			logger.log(JSON.stringify(output, null, 2));
		}
	},
});
