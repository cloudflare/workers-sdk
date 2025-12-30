import { APIError, readFileSync, UserError } from "@cloudflare/workers-utils";
import { performApiFetch } from "../cfetch/internal";
import {
	createAlias,
	createCommand,
	createNamespace,
} from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";

export const analyticsEngineNamespace = createNamespace({
	metadata: {
		description: "📊 Query Workers Analytics Engine datasets",
		status: "stable",
		owner: "Workers: Workers Observability",
	},
});

export const analyticsEngineAlias = createAlias({
	aliasOf: "wrangler analytics-engine",
	metadata: {
		hidden: true,
	},
});

interface AnalyticsEngineRow {
	[key: string]: unknown;
}

interface AnalyticsEngineResult {
	data: AnalyticsEngineRow[];
	meta: { name: string; type: string }[];
}

export const analyticsEngineRunCommand = createCommand({
	metadata: {
		description: "Run a SQL query against your Analytics Engine datasets",
		status: "stable",
		owner: "Workers: Workers Observability",
	},
	behaviour: {
		printBanner: (args) => args.format !== "json",
	},
	positionalArgs: ["query"],
	args: {
		query: {
			describe: "The SQL query to execute",
			type: "string",
		},
		file: {
			describe: "A file containing the SQL query to execute",
			type: "string",
		},
		format: {
			describe: "Output format",
			type: "string",
			choices: ["json", "table"] as const,
		},
	},
	async handler(args, { config }) {
		const { query: queryArg, file, format: formatArg } = args;

		// Validate input - must have either query or file, but not both
		if (queryArg && file) {
			throw new UserError(
				"Cannot specify both a query and a file. Please use one or the other."
			);
		}

		if (!queryArg && !file) {
			throw new UserError(
				"Must specify either a query or a file containing a query."
			);
		}

		// Read query from file or use positional argument
		const query = file ? readFileSync(file) : queryArg;

		if (!query) {
			throw new UserError("Query cannot be empty.");
		}

		// Determine output format - default to table for TTY, json otherwise
		const format = formatArg ?? (process.stdout.isTTY ? "table" : "json");

		const accountId = await requireAuth(config);

		// Use performApiFetch which handles auth consistently with other wrangler commands
		// Analytics Engine API returns raw data, not Cloudflare API envelope
		let response;
		try {
			response = await performApiFetch(
				config,
				`/accounts/${accountId}/analytics_engine/sql`,
				{
					method: "POST",
					headers: {
						"Content-Type": "text/plain",
					},
					body: query,
				}
			);
		} catch (error) {
			throw new APIError({
				text: `Failed to connect to Analytics Engine API: ${error instanceof Error ? error.message : String(error)}`,
			});
		}

		const text = await response.text();

		if (!response.ok) {
			throw new APIError({
				text: `Analytics Engine API error: ${response.status} ${response.statusText}`,
				notes: [{ text }],
				status: response.status,
			});
		}

		// Handle output based on format
		if (format === "table") {
			// Try to parse as JSON for table display
			try {
				const data = JSON.parse(text) as AnalyticsEngineResult;
				if (data.data && data.meta && Array.isArray(data.data)) {
					if (data.data.length === 0) {
						logger.log("Query executed successfully with no results.");
						return;
					}

					const columns = data.meta.map((col) => col.name);
					logger.table(
						data.data.map((row) =>
							Object.fromEntries(
								columns.map((col) => [col, String(row[col] ?? "")])
							)
						),
						{ wordWrap: true, head: columns }
					);
				} else {
					// JSON but not in expected format - output as-is
					logger.log(text);
				}
			} catch {
				// Not JSON (user used FORMAT TabSeparated, etc.) - output raw
				logger.log(text);
			}
		} else {
			// JSON format - output as-is
			logger.log(text);
		}
	},
});
