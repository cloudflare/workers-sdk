import { fetchResult } from "../cfetch";
import { createCommand, createNamespace } from "../core/create-command";
import { UserError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";

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

		try {
			// TODO: add a spinner.
			logger.log(`Executing SQL query on '${warehouse}'...`);
			const response = await fetch(
				`https://api.dqe.cloudflarestorage.com/warehouse/${warehouse}/query`,
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

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Query failed with status ${response.status}: ${errorText}`
				);
			}

			const result = await response.json();
			if (result) {
				logger.log("\nQuery Results:");
				logger.log(JSON.stringify(result, null, 2));
			} else {
				logger.log("Query executed successfully with no results");
			}
		} catch (error) {
			throw new UserError(
				`Failed to execute SQL query: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});
