import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import {
	APIError,
	parseJSON,
	readFileSync,
	UserError,
	truncate,
} from "@cloudflare/workers-utils";
import prettyBytes from "pretty-bytes";
import { fetch } from "undici";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import {
	getCloudflareAPITokenFromEnv,
	getWranglerR2SqlAuthToken,
} from "../user/auth-variables";

interface SqlQueryResponse {
	result?: {
		request_id?: string;
		schema: { name: string; type: string }[];
		rows: Record<string, unknown>[];
		metrics: SqlMetrics;
	};
	success: boolean;
	errors: { code: number; message: string }[];
	messages: string[];
}

interface SqlMetrics {
	r2_requests_count: number;
	files_scanned: number;
	bytes_scanned: number;
}

function isExplainJsonQuery(query: string): boolean {
	return /^\s*explain\s+format\s+json\b/i.test(query);
}

function formatExplainJsonResults(data: SqlQueryResponse): void {
	if (!data?.result?.rows || data.result.rows.length === 0) {
		logger.log("EXPLAIN returned no results");
		return;
	}

	const { rows } = data.result;

	if (rows.length === 1) {
		const firstRow = rows[0];
		const values = Object.values(firstRow);
		if (
			values.length === 1 &&
			values[0] !== null &&
			typeof values[0] === "object"
		) {
			logger.log(JSON.stringify(values[0], null, 2));
			return;
		}
		if (values.length === 1 && typeof values[0] === "string") {
			try {
				const parsed = JSON.parse(values[0]);
				logger.log(JSON.stringify(parsed, null, 2));
				return;
			} catch {
				// Not valid JSON, fall through to table display
			}
		}
	}

	formatTableResults(data);
}

function formatTableResults(data: SqlQueryResponse): void {
	if (!data?.result?.rows || data.result.rows.length === 0) {
		logger.log("Query executed successfully with no results");
		return;
	}

	const { schema, rows } = data.result;
	const column_order = schema.map((field) => field.name);
	logger.table(
		rows.map((row) =>
			Object.fromEntries(
				column_order.map((column) => {
					const value = row[column];
					if (value === null || value === undefined) {
						return [column, ""];
					}
					if (typeof value === "object") {
						return [
							column,
							JSON.stringify(value, (_k, v) => (v === null ? "" : v)),
						];
					}
					return [column, String(value)];
				})
			)
		),
		{ wordWrap: true, head: column_order }
	);
}

function formatCsvResults(data: SqlQueryResponse): void {
	if (!data?.result?.rows || data.result.rows.length === 0) {
		logger.log("Query executed successfully with no results");
		return;
	}

	const { schema, rows } = data.result;
	const columns = schema.map((field) => field.name);

	logger.log(columns.map(escapeCsvField).join(","));
	for (const row of rows) {
		const values = columns.map((col) => {
			const value = row[col];
			if (value === null || value === undefined) {
				return "";
			}
			if (typeof value === "object") {
				return escapeCsvField(JSON.stringify(value));
			}
			return escapeCsvField(String(value));
		});
		logger.log(values.join(","));
	}
}

function escapeCsvField(field: string): string {
	if (
		field.includes(",") ||
		field.includes('"') ||
		field.includes("\n") ||
		field.includes("\r")
	) {
		return `"${field.replace(/"/g, '""')}"`;
	}
	return field;
}

function formatMetrics(metrics: SqlMetrics, duration: number): void {
	logger.log(
		`Read ${prettyBytes(metrics.bytes_scanned)} across ${metrics.files_scanned} files (${metrics.r2_requests_count} R2 requests)`
	);
	if (duration > 0) {
		const bytesPerSecond = (metrics.bytes_scanned / duration) * 1000;
		logger.log(`On average, ${prettyBytes(bytesPerSecond)} / s`);
	}
}

export const r2SqlNamespace = createNamespace({
	metadata: {
		description: "Send queries and manage R2 SQL",
		status: "open beta",
		owner: "Product: R2 SQL",
	},
});

export const r2SqlQueryCommand = createCommand({
	metadata: {
		description: "Execute SQL query against R2 Data Catalog",
		status: "open beta",
		owner: "Product: R2",
	},
	positionalArgs: ["warehouse", "query"],
	args: {
		warehouse: {
			describe: "R2 Data Catalog warehouse name",
			type: "string",
			demandOption: true,
		},
		query: {
			describe: "The SQL query to execute",
			type: "string",
		},
		"sql-file": {
			describe: "A .sql file to execute",
			type: "string",
		},
		json: {
			describe: "Output results as JSON",
			type: "boolean",
			default: false,
		},
		csv: {
			describe: "Output results as CSV",
			type: "boolean",
			default: false,
		},
	},
	behaviour: {
		printBanner: (args) => !args.json && !args.csv,
	},
	async handler({ warehouse, query, sqlFile, json, csv }) {
		if (sqlFile && query) {
			throw new UserError(
				"Cannot provide both a query argument and --sql-file flag.",
				{ telemetryMessage: "r2 sql query conflicting query and file" }
			);
		}

		let resolvedQuery: string;
		if (sqlFile) {
			try {
				resolvedQuery = readFileSync(sqlFile);
			} catch (error) {
				throw new UserError(
					`Failed to read SQL file '${sqlFile}': ${error instanceof Error ? error.message : String(error)}`,
					{ telemetryMessage: "r2 sql query sql file read failed" }
				);
			}
		} else if (query) {
			resolvedQuery = query;
		} else {
			throw new UserError(
				"Must provide a SQL query as an argument or via --sql-file.",
				{ telemetryMessage: "r2 sql query missing query" }
			);
		}

		if (json && csv) {
			throw new UserError(
				"Cannot use both --json and --csv flags at the same time.",
				{ telemetryMessage: "r2 sql query conflicting output formats" }
			);
		}

		let token = getWranglerR2SqlAuthToken();
		if (!token) {
			token = getCloudflareAPITokenFromEnv();
			if (!token) {
				throw new UserError(
					"Missing WRANGLER_R2_SQL_AUTH_TOKEN environment variable. " +
						"Tried to fallback to CLOUDFLARE_API_TOKEN, didn't find it either. " +
						"Please follow instructions in https://developers.cloudflare.com/r2/sql/platform/troubleshooting/ to create a token. " +
						"Once done, you can prefix the command with the variable definition like so: `WRANGLER_R2_SQL_AUTH_TOKEN=... wrangler r2 sql query ...`. " +
						"There also other ways to provide the value of this variable, see https://developers.cloudflare.com/workers/wrangler/system-environment-variables/ for more details.",
					{ telemetryMessage: "r2 sql query missing auth token" }
				);
			} else {
				logger.warn(
					"Missing WRANGLER_R2_SQL_AUTH_TOKEN environment variable, falling back to CLOUDFLARE_API_TOKEN"
				);
			}
		}

		const splitIndex = warehouse.indexOf("_");
		if (splitIndex === -1) {
			throw new UserError("Warehouse name has invalid format", {
				telemetryMessage: "r2 sql query invalid warehouse format",
			});
		}
		const [accountId, bucketName] = [
			warehouse.slice(0, splitIndex),
			warehouse.slice(splitIndex + 1),
		];

		const s = spinner();
		if (!json && !csv) {
			s.start("Query in progress");
		}
		const apiUrl = `https://api.sql.cloudflarestorage.com/api/v1/accounts/${accountId}/r2-sql/query/${bucketName}`;
		let responseStatus = 0;
		let statusText = "";
		let text = "";
		let duration = 0;
		try {
			const start = Date.now();
			const response = await fetch(apiUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					warehouse,
					query: resolvedQuery,
				}),
			});
			responseStatus = response.status;
			statusText = response.statusText;
			text = await response.text();
			duration = Date.now() - start;
		} catch (error) {
			throw new APIError({
				text: `Failed to connect to R2 SQL API: ${error instanceof Error ? error.message : String(error)}`,
				telemetryMessage: false,
			});
		}

		if (responseStatus === 403) {
			logger.error(
				"Please check that token in WRANGLER_R2_SQL_AUTH_TOKEN or CLOUDFLARE_API_TOKEN has the correct permissions. " +
					"See https://developers.cloudflare.com/r2/sql/platform/troubleshooting/ for more details."
			);
		}

		let parsed: SqlQueryResponse;
		try {
			parsed = parseJSON(text) as SqlQueryResponse;
		} catch {
			throw new APIError({
				text: "Received a malformed response from the API",
				notes: [
					{
						text: truncate(text, 100),
					},
					{
						text: `POST ${apiUrl} -> ${responseStatus} ${statusText}`,
					},
				],
				status: responseStatus,
				telemetryMessage: false,
			});
		}

		if (!json && !csv) {
			s.stop();
		}

		if (parsed.success) {
			if (json) {
				logger.json(parsed.result?.rows ?? []);
			} else if (csv) {
				formatCsvResults(parsed);
			} else if (isExplainJsonQuery(resolvedQuery)) {
				formatExplainJsonResults(parsed);
			} else {
				formatTableResults(parsed);
			}

			if (parsed.result?.metrics && !json && !csv) {
				formatMetrics(parsed.result.metrics, duration);
			}
		} else {
			if (json) {
				logger.json(parsed);
			} else {
				let errors = "";
				for (const { code, message } of parsed.errors) {
					errors += `\n* ${code}: ${message}`;
				}
				logger.error(`Query failed because of the following errors:${errors}`);
			}
		}
	},
});
