import CLITable from "cli-table3";
import prettyBytes from "pretty-bytes";
import { fetchResult } from "../cfetch";
import { createCommand, createNamespace } from "../core/create-command";
import { UserError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";

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

	// Create table with cli-table3.
	const table = new CLITable({
		head: column_order,
		wordWrap: true,
	});

	// Add rows to the table.
	for (const row of rows) {
		const rowData = column_order.map((col) => String(row[col] ?? ""));
		table.push(rowData);
	}

	logger.log(table.toString());

	// Print stats if available.
	if (stats) {
		logger.log(
			`Read ${prettyBytes(stats.total_r2_bytes_read)} across ${stats.total_files_scanned} files from R2`
		);
		logger.log(
			`On average, ${prettyBytes(stats.total_r2_bytes_read / duration)} / s`
		);
	}
}

export const r2SqlNamespace = createNamespace({
	metadata: {
		description: "Send queries and manage R2 Data Catalog SQL",
		status: "open-beta",
		owner: "Product: R2 Data Catalog SQL",
	},
});

export const r2SqlEnableCommand = createCommand({
	metadata: {
		description:
			"Enable sending SQL queries to R2 Data Catalogs in this account",
		status: "open-beta",
		owner: "Product: R2 Data Catalog SQL",
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		logger.log("Enabling R2 Data Catalog SQL for your account...");

		try {
			await fetchResult(config, `/accounts/${accountId}/dqe/enable`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			logger.log("✅ R2 Data Catalog SQL is enabled for your account");
		} catch (error) {
			throw new UserError(
				`Failed to enable R2 Data Catalog SQL: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});

export const r2SqlDisableCommand = createCommand({
	metadata: {
		description:
			"Disable sending SQL queries to R2 Data Catalogs in this account",
		status: "open-beta",
		owner: "Product: R2 Data Catalog SQL",
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		logger.log("Disabling R2 Data Catalog SQL for your account...");

		try {
			await fetchResult(config, `/accounts/${accountId}/dqe/disable`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			logger.log("✅ R2 Data Catalog SQL is disabled for your account");
		} catch (error) {
			throw new UserError(
				`Failed to disable R2 Data Catalog SQL: ${error instanceof Error ? error.message : String(error)}`
			);
		}
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
	async handler(args, { config: _config }) {
		const { warehouse, query } = args;

		const token = process.env.CLOUDFLARE_R2_SQL_TOKEN;
		if (!token) {
			// TODO: provide documentation link.
			throw new UserError(
				"CLOUDFLARE_R2_SQL_TOKEN environment variable is not set. " +
					"Please set it to authenticate with the R2 Data Catalog SQL query service."
			);
		}

		// TODO: add a spinner.
		const splitIndex = warehouse.indexOf("_");
		if (splitIndex === -1) {
			throw new UserError("Warehouse name has invalid format");
		}
		const [accountId, bucketName] = [
			warehouse.slice(0, splitIndex),
			warehouse.slice(splitIndex + 1),
		];

		let responseStatus = null;
		let text = null;
		let duration = null;
		try {
			const start = Date.now();
			const response = await fetch(
				`https://api.dqe.cloudflarestorage.com/api/v1/accounts/${accountId}/dqe/query/${bucketName}`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						warehouse,
						query,
					}),
				}
			);
			responseStatus = response.status;
			text = await response.text();
			duration = Date.now() - start;
		} catch (error) {
			// TODO: These shouldn't be UserErrors, but API errors.
			throw new UserError(
				`Failed to connect to SQL APi: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		let parsed = null;
		try {
			parsed = JSON.parse(text) as SqlQueryResult;
		} catch {
			if (responseStatus === 200) {
				throw new UserError(
					`Internal error, API response format is invalid: ${text}`
				);
			} else {
				throw new UserError(
					`Query failed with HTTP ${responseStatus}: ${text}`
				);
			}
		}

		if (parsed.success) {
			formatSqlResults(parsed, duration);
		} else {
			logger.error("Query failed because of the following errors:");
			for (const { code, message } of parsed.errors) {
				logger.error(`* ${code}: ${message}\n`);
			}
		}
	},
});
