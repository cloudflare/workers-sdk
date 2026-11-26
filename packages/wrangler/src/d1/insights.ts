import { UserError } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { fetchGraphqlResultOrThrow, GraphQLAnalyticsError } from "../cfetch";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { getDatabaseByNameOrBinding } from "./utils";
import type { D1QueriesGraphQLResponse } from "./types";

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
				throw new UserError(
					`Invalid --time-period value "${durationString}": ${durationValue} days exceeds the maximum of 31 days. Provide a value of 31d or less.`,
					{ telemetryMessage: "d1 insights duration exceeds maximum" }
				);
			}
			startDate = new Date(
				endDate.getTime() - durationValue * 24 * 60 * 60 * 1000
			);
			break;
		case "m":
			if (durationValue > 31 * 24 * 60) {
				throw new UserError(
					`Invalid --time-period value "${durationString}": ${durationValue} minutes exceeds the maximum of ${31 * 24 * 60} minutes (31 days). Provide a value of ${31 * 24 * 60}m or less.`,
					{ telemetryMessage: "d1 insights duration exceeds maximum" }
				);
			}
			startDate = new Date(endDate.getTime() - durationValue * 60 * 1000);
			break;
		case "h":
			if (durationValue > 31 * 24) {
				throw new UserError(
					`Invalid --time-period value "${durationString}": ${durationValue} hours exceeds the maximum of ${31 * 24} hours (31 days). Provide a value of ${31 * 24}h or less.`,
					{ telemetryMessage: "d1 insights duration exceeds maximum" }
				);
			}
			startDate = new Date(endDate.getTime() - durationValue * 60 * 60 * 1000);
			break;
		default:
			throw new UserError(
				`Invalid --time-period unit "${durationUnit}" in "${durationString}". Supported units: d (days), h (hours), m (minutes). Example: --time-period=7d.`,
				{ telemetryMessage: "d1 insights invalid duration unit" }
			);
	}

	return [startDate.toISOString(), endDate.toISOString()];
}

function toD1InsightsUserError(
	error: GraphQLAnalyticsError,
	accountId: string
): UserError {
	switch (error.reason) {
		case "rate-limited":
			return new UserError(
				dedent`
					Could not get D1 insights: the GraphQL Analytics API rate limited the request (${error.apiMessage}).

					${error.retryAfterMs === undefined ? "The rate limit resets within 5 minutes: wait" : `Wait ${Math.ceil(error.retryAfterMs / 1000)} seconds`} before running \`wrangler d1 insights\` again. To use less of the rate limit budget, pass a database name, a shorter --time-period, or a smaller --limit.
					See https://developers.cloudflare.com/analytics/graphql-api/limits/
				`,
				{ telemetryMessage: "d1 insights graphql rate limited", cause: error }
			);
		case "unauthorized":
			return new UserError(
				dedent`
					Could not get D1 insights: not allowed to read analytics for account ${accountId} (${error.apiMessage}).

					\`wrangler d1 insights\` needs the "Account Analytics: Read" permission on this account. If you use CLOUDFLARE_API_TOKEN, add that permission to the token at https://dash.cloudflare.com/profile/api-tokens. Otherwise run \`wrangler login\` again, and check that CLOUDFLARE_ACCOUNT_ID or \`account_id\` points at an account you are a member of.
				`,
				{ telemetryMessage: "d1 insights graphql unauthorized", cause: error }
			);
		case "other":
			return new UserError(
				dedent`
					Could not get D1 insights: the GraphQL Analytics API returned an error (${error.apiMessage}).

					Check the --time-period, --limit and sort options, then run \`wrangler d1 insights\` again.
					See https://developers.cloudflare.com/analytics/graphql-api/errors/
				`,
				{ telemetryMessage: "d1 insights graphql error", cause: error }
			);
	}
}

export const d1InsightsCommand = createCommand({
	metadata: {
		description:
			"Get information about the queries run on a D1 database, or on all D1 databases in the account",
		epilogue: "This command acts on remote D1 Databases.",
		status: "experimental",
		owner: "Product: D1",
	},
	behaviour: {
		supportTemporary: true,
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			description:
				"The name or binding of the DB. Omit to get insights for every D1 database in the account",
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
			description: "return output as JSON",
			default: false,
		},
	},
	positionalArgs: ["name"],
	async handler(
		{ name, json, limit, timePeriod, sortType, sortBy, sortDirection },
		{ config }
	) {
		const accountId = await requireAuth(config);
		const db =
			name === undefined
				? undefined
				: await getDatabaseByNameOrBinding(config, accountId, name);

		const output: Record<string, string | number | null>[] = [];

		const [startDate, endDate] = getDurationDates(timePeriod);
		const parsedSortBy = cliOptionToGraphQLOption[sortBy];
		const orderByClause =
			parsedSortBy === "count"
				? `${parsedSortBy}_${sortDirection}`
				: `${sortType}_${parsedSortBy}_${sortDirection}`;
		const graphqlQueriesResult =
			await fetchGraphqlResultOrThrow<D1QueriesGraphQLResponse>(config, {
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
													databaseId
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
									...(db ? { databaseId: db.uuid } : {}),
								},
							],
						},
					},
				}),
				headers: {
					"Content-Type": "application/json",
				},
			}).catch((err: unknown) => {
				if (err instanceof GraphQLAnalyticsError) {
					throw toD1InsightsUserError(err, accountId);
				}
				throw err;
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
					...(db ? {} : { databaseId: row.dimensions.databaseId ?? null }),
				});
			}
		);

		if (json) {
			logger.log(JSON.stringify(output, null, 2));
		} else {
			logger.log(JSON.stringify(output, null, 2));
		}
	},
});
