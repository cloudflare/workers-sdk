import { fetchGraphqlResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import {
	d1BetaWarning,
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromId,
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
		.option("last", {
			choices: [1, 7, 31] as const,
			describe: "Fetch data from the last X number of days",
			default: 1,
		})
		.option("sort-by", {
			choices: ["duration", "reads", "writes"] as const,
			describe: "Choose the field you want to sort insights by",
			default: "duration",
		})
		.option("sort-direction", {
			choices: ["ASC", "DESC"] as const,
			describe: "Choose a sort direction",
			default: "DESC",
		})
		.option("count", {
			describe: "fetch insights about the first X queries",
			type: "number",
			default: 5,
		})
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.epilogue(d1BetaWarning);
}

const cliOptionToGraphQLOption = {
	duration: "queryDurationMs",
	reads: "rowsRead",
	writes: "rowsWritten",
};

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;
export const Handler = withConfig<HandlerOptions>(
	async ({
		name,
		config,
		json,
		count,
		last,
		sortBy,
		sortDirection,
	}): Promise<void> => {
		const accountId = await requireAuth(config);
		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		const result = await getDatabaseInfoFromId(accountId, db.uuid);

		const output: Record<string, string | number>[] = [];

		if (result.version === "beta") {
			const endDate = new Date();
			const startDate = new Date(
				new Date(endDate).setDate(endDate.getDate() - last)
			);
			const parsedSortBy =
				cliOptionToGraphQLOption[sortBy as "duration" | "reads" | "writes"];
			const graphqlQueriesResult =
				await fetchGraphqlResult<D1QueriesGraphQLResponse>({
					method: "POST",
					body: JSON.stringify({
						query: `query getD1QueriesOverviewQuery($accountTag: string, $filter: ZoneWorkersRequestsFilter_InputObject) {
								viewer {
									accounts(filter: {accountTag: $accountTag}) {
										d1QueriesAdaptiveGroups(limit: ${count}, filter: $filter, orderBy: [avg_${parsedSortBy}_${sortDirection}]) {
											avg {
												queryDurationMs
												rowsRead
												rowsWritten
											}
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
										datetimeHour_geq: startDate.toISOString(),
										datetimeHour_leq: endDate.toISOString(),
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

			if (graphqlQueriesResult) {
				graphqlQueriesResult.data?.viewer?.accounts[0]?.d1QueriesAdaptiveGroups?.forEach(
					(row) => {
						if (!row.dimensions.query) return;
						output.push({
							query: row.dimensions.query,
							rowsRead: row?.avg?.rowsRead ?? 0,
							rowsWritten: row?.avg?.rowsWritten ?? 0,
							duration: row?.avg?.queryDurationMs ?? 0,
						});
					}
				);
			}
		}

		if (json) {
			logger.log(JSON.stringify(output, null, 2));
		} else {
			// TODO: maybe figure out a nicer way to output this, but honestly it looks fine?
			logger.log(JSON.stringify(output, null, 2));
		}
	}
);
