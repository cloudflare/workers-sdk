import { spinner } from "@cloudflare/cli/interactive";
import { APIError, parseJSON, UserError } from "@cloudflare/workers-utils";
import prettyBytes from "pretty-bytes";
import { fetch } from "undici";
import { truncate } from "../cfetch/internal";
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
		metrics: {
			r2_requests_count: number;
			files_scanned: number;
			bytes_scanned: number;
		};
	};
	success: boolean;
	errors: { code: number; message: string }[];
	messages: string[];
}

function formatSqlResults(data: SqlQueryResponse, duration: number): void {
	if (!data?.result?.rows || data.result.rows.length === 0) {
		logger.log("Query executed successfully with no results");
		return;
	}

	const { schema, rows, metrics } = data.result;
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

	logger.log(
		`Read ${prettyBytes(metrics.bytes_scanned)} across ${metrics.files_scanned} files from R2`
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
			demandOption: true,
		},
	},
	async handler({ warehouse, query }) {
		let token = getWranglerR2SqlAuthToken();
		if (!token) {
			token = getCloudflareAPITokenFromEnv();
			if (!token) {
				throw new UserError(
					"Missing WRANGLER_R2_SQL_AUTH_TOKEN environment variable. " +
						"Tried to fallback to CLOUDFLARE_API_TOKEN, didn't find it either. " +
						"Please follow instructions in https://developers.cloudflare.com/r2/sql/platform/troubleshooting/ to create a token. " +
						"Once done, you can prefix the command with the variable definition like so: `WRANGLER_R2_SQL_AUTH_TOKEN=... wrangler r2 sql query ...`. " +
						"There also other ways to provide the value of this variable, see https://developers.cloudflare.com/workers/wrangler/system-environment-variables/ for more details."
				);
			} else {
				logger.warn(
					"Missing WRANGLER_R2_SQL_AUTH_TOKEN environment variable, falling back to CLOUDFLARE_API_TOKEN"
				);
			}
		}

		const splitIndex = warehouse.indexOf("_");
		if (splitIndex === -1) {
			throw new UserError("Warehouse name has invalid format");
		}
		const [accountId, bucketName] = [
			warehouse.slice(0, splitIndex),
			warehouse.slice(splitIndex + 1),
		];

		const s = spinner();
		s.start("Query in progress");
		const apiUrl = `https://api.sql.cloudflarestorage.com/api/v1/accounts/${accountId}/r2-sql/query/${bucketName}`;
		let responseStatus = null;
		let statusText = null;
		let text = null;
		let duration = null;
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
					query,
				}),
			});
			responseStatus = response.status;
			statusText = response.statusText;
			text = await response.text();
			duration = Date.now() - start;
		} catch (error) {
			throw new APIError({
				text: `Failed to connect to R2 SQL API: ${error instanceof Error ? error.message : String(error)}`,
			});
		}

		if (responseStatus === 403) {
			logger.error(
				"Please check that token in WRANGLER_R2_SQL_AUTH_TOKEN or CLOUDFLARE_API_TOKEN has the correct permissions. " +
					"See https://developers.cloudflare.com/r2/sql/platform/troubleshooting/ for more details."
			);
		}

		let parsed = null;
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
			});
		}

		s.stop();
		if (parsed.success) {
			formatSqlResults(parsed, duration);
		} else {
			let errors = "";
			for (const { code, message } of parsed.errors) {
				errors += `\n* ${code}: ${message}`;
			}
			logger.error(`Query failed because of the following errors:${errors}`);
		}
	},
});
