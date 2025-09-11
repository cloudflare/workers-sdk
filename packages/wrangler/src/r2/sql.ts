import { spinner } from "@cloudflare/cli/interactive";
import prettyBytes from "pretty-bytes";
import { fetch } from "undici";
import { truncate } from "../cfetch/internal";
import { createCommand, createNamespace } from "../core/create-command";
import { UserError } from "../errors";
import { logger } from "../logger";
import { APIError, parseJSON } from "../parse";
import { getCloudflareAPITokenFromEnv } from "../user/auth-variables";

interface SqlQueryResult {
	result?: {
		column_order: string[];
		rows: Record<string, unknown>[];
		stats?: {
			total_r2_requests: number;
			total_r2_bytes_read: number;
			total_r2_bytes_written: number;
			total_bytes_matched: number;
			total_rows_skipped: number;
			total_files_scanned: number;
		};
	};
	success: boolean;
	errors: { code: number; message: string }[];
	messages: string[];
}

function formatSqlResults(data: SqlQueryResult, duration: number): void {
	if (!data?.result?.rows || data.result.rows.length === 0) {
		logger.log("Query executed successfully with no results");
		return;
	}

	const { column_order, rows, stats } = data.result;

	logger.table(
		rows.map((row) =>
			Object.fromEntries(
				column_order.map((column) => [column, String(row[column] ?? "")])
			)
		),
		{ wordWrap: true, head: column_order }
	);

	// Print stats if available.
	if (stats) {
		logger.log(
			`Read ${prettyBytes(stats.total_r2_bytes_read)} across ${stats.total_files_scanned} files from R2`
		);
		if (duration > 0) {
			const bytesPerSecond = (stats.total_r2_bytes_read / duration) * 1000;
			logger.log(`On average, ${prettyBytes(bytesPerSecond)} / s`);
		}
	}
}

export const r2SqlNamespace = createNamespace({
	metadata: {
		description: "Send queries and manage R2 SQL",
		status: "open-beta",
		owner: "Product: R2 SQL",
	},
});

export const r2SqlQueryCommand = createCommand({
	metadata: {
		description: "Execute SQL query against R2 Data Catalog",
		status: "open-beta",
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
		const token = getCloudflareAPITokenFromEnv();
		if (!token) {
			throw new UserError(
				"Missing CLOUDFLARE_API_TOKEN environment variable. " +
					"Please follow instructions in https://developers.cloudflare.com/r2/sql/platform/troubleshooting/ to create a token. " +
					"Once done, you can prefix the command with the variable definition like so: `CLOUDFLARE_API_TOKEN=... wrangler r2 sql query ...`. " +
					"There also other ways to provide the value of this variable, see https://developers.cloudflare.com/workers/wrangler/system-environment-variables/ for more details."
			);
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

		let parsed = null;
		try {
			parsed = parseJSON(text) as SqlQueryResult;
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
