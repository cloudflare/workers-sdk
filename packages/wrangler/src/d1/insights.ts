import { fetchGraphqlResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { printWranglerBanner } from "../wrangler-banner";
import {
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromIdOrName,
} from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { D1QueriesGraphQLResponse, Database } from "./types";

export function Options(d1ListYargs: CommonYargsArgv) {
	return d1ListYargs
		.positional("name", {
			describe: "The name of the DB",
			type: "string",
			demandOption: true,
		})
		.option("timePeriod", {
			describe: "Fetch data from now to the provided time period",
			default: "1d" as const,
		})
		.option("sort-type", {
			choices: ["sum", "avg"] as const,
			describe: "Choose the operation you want to sort insights by",
			default: "sum" as const,
		})
		.option("sort-by", {
			choices: ["time", "reads", "writes", "count"] as const,
			describe: "Choose the field you want to sort insights by",
			default: "time" as const,
		})
		.option("sort-direction", {
			choices: ["ASC", "DESC"] as const,
			describe: "Choose a sort direction",
			default: "DESC" as const,
		})
		.option("limit", {
			describe: "fetch insights about the first X queries",
			type: "number",
			default: 5,
		})
		.alias("count", "limit") //--limit used to be --count, we renamed the flags for clarity
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		});
}

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

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;
export const Handler = withConfig<HandlerOptions>(
	async ({
		name,
		config,
		json,
		limit,
		timePeriod,
		sortType,
		sortBy,
		sortDirection,
	}): Promise<void> => {
		const accountId = await requireAuth(config);
		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		const result = await getDatabaseInfoFromIdOrName(accountId, db.uuid);

		const output: Record<string, string | number>[] = [];

		if (result.version !== "alpha") {
			const [startDate, endDate] = getDurationDates(timePeriod);
			const parsedSortBy = cliOptionToGraphQLOption[sortBy];
			const orderByClause =
				parsedSortBy === "count"
					? `${parsedSortBy}_${sortDirection}`
					: `${sortType}_${parsedSortBy}_${sortDirection}`;
			const graphqlQueriesResult =
				await fetchGraphqlResult<D1QueriesGraphQLResponse>({
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
			await printWranglerBanner();
			logger.log(
				"-------------------\n🚧 `wrangler d1 insights` is an experimental command.\n🚧 Flags for this command, their descriptions, and output may change between wrangler versions.\n-------------------\n"
			);
			logger.log(JSON.stringify(output, null, 2));
		}
	}
);
