import {
	APIError,
	getCloudflareApiEnvironmentFromEnv,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	disableR2Catalog,
	disableR2CatalogCompaction,
	disableR2CatalogSnapshotExpiration,
	disableR2CatalogTableCompaction,
	disableR2CatalogTableSnapshotExpiration,
	enableR2Catalog,
	enableR2CatalogCompaction,
	enableR2CatalogSnapshotExpiration,
	enableR2CatalogTableCompaction,
	enableR2CatalogTableSnapshotExpiration,
	getR2Catalog,
	upsertR2CatalogCredential,
} from "./helpers/catalog";

export const r2BucketCatalogNamespace = createNamespace({
	metadata: {
		description:
			"Manage the data catalog for your R2 buckets - provides an Iceberg REST interface for query engines like Spark and PyIceberg",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
});

export const r2BucketCatalogEnableCommand = createCommand({
	metadata: {
		description: "Enable the data catalog on an R2 bucket",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket to enable",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const response = await enableR2Catalog(config, accountId, args.bucket);

		let catalogHost: string;
		const env = getCloudflareApiEnvironmentFromEnv();
		const path = response.name.replace("_", "/");
		if (env === "staging") {
			catalogHost = `https://catalog-staging.cloudflarestorage.com/${path}`;
		} else {
			catalogHost = `https://catalog.cloudflarestorage.com/${path}`;
		}

		logger.log(
			`✨ Successfully enabled data catalog on bucket '${args.bucket}'.

Catalog URI: '${catalogHost}'
Warehouse: '${response.name}'

Use this Catalog URI with Iceberg-compatible query engines (Spark, PyIceberg etc.) to query data as tables.
Note: You will need a Cloudflare API token with 'R2 Data Catalog' permission to authenticate your client with this catalog.
For more details, refer to: https://developers.cloudflare.com/r2/api/s3/tokens/`
		);
	},
});

export const r2BucketCatalogDisableCommand = createCommand({
	metadata: {
		description: "Disable the data catalog for an R2 bucket",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket to disable the data catalog for",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const confirmedDisable = await confirm(
			`Are you sure you want to disable the data catalog for bucket '${args.bucket}'?`
		);
		if (!confirmedDisable) {
			logger.log("Disable cancelled.");
			return;
		}

		try {
			await disableR2Catalog(config, accountId, args.bucket);

			logger.log(
				`Successfully disabled the data catalog on bucket '${args.bucket}'.`
			);
		} catch (e) {
			// R2 Data Catalog 40401 corresponds to a 404
			if (e instanceof APIError && e.code == 40401) {
				logger.log(
					`Data catalog is not enabled for bucket '${args.bucket}'. Please use 'wrangler r2 bucket catalog enable ${args.bucket}' to first enable the data catalog on this bucket.`
				);
			} else {
				throw e;
			}
		}
	},
});

export const r2BucketCatalogGetCommand = createCommand({
	metadata: {
		description: "Get the status of the data catalog for an R2 bucket",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the R2 bucket whose data catalog status to retrieve",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		logger.log(`Getting data catalog status for '${args.bucket}'...\n`);

		try {
			const catalog = await getR2Catalog(config, accountId, args.bucket);

			const env = getCloudflareApiEnvironmentFromEnv();
			let catalogHost: string;
			const path = catalog.name.replace("_", "/");
			if (env === "staging") {
				catalogHost = `https://catalog-staging.cloudflarestorage.com/${path}`;
			} else {
				catalogHost = `https://catalog.cloudflarestorage.com/${path}`;
			}

			const output = {
				"Catalog URI": catalogHost,
				Warehouse: catalog.name,
				Status: catalog.status,
			};

			logger.log(formatLabelledValues(output));
		} catch (e) {
			// R2 Data Catalog 40401 corresponds to a 404
			if (e instanceof APIError && e.code == 40401) {
				logger.log(
					`Data catalog is not enabled for bucket '${args.bucket}'. Please use 'wrangler r2 bucket catalog enable ${args.bucket}' to first enable the data catalog on this bucket.`
				);
			} else {
				throw e;
			}
		}
	},
});

export const r2BucketCatalogCompactionNamespace = createNamespace({
	metadata: {
		description:
			"Control settings for automatic file compaction maintenance jobs for your R2 data catalog",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
});

export const r2BucketCatalogCompactionEnableCommand = createCommand({
	metadata: {
		description:
			"Enable automatic file compaction for your R2 data catalog or a specific table",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket", "namespace", "table"],
	args: {
		bucket: {
			describe: "The name of the bucket which contains the catalog",
			type: "string",
			demandOption: true,
		},
		namespace: {
			describe:
				"The namespace containing the table (optional, for table-level compaction)",
			type: "string",
			demandOption: false,
		},
		table: {
			describe: "The name of the table (optional, for table-level compaction)",
			type: "string",
			demandOption: false,
		},
		"target-size": {
			describe:
				"The target size for compacted files in MB (allowed values: 64, 128, 256, 512)",
			type: "number",
			demandOption: false,
			default: 128,
		},
		token: {
			describe:
				"A cloudflare api token with access to R2 and R2 Data Catalog (required for catalog-level compaction settings only)",
			demandOption: false,
			type: "string",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		// Validate namespace and table are provided together
		if (args.namespace && !args.table) {
			throw new UserError("Table name is required when namespace is specified");
		}
		if (!args.namespace && args.table) {
			throw new UserError("Namespace is required when table is specified");
		}

		if (args.namespace && args.table) {
			// Table-level compaction
			await enableR2CatalogTableCompaction(
				config,
				accountId,
				args.bucket,
				args.namespace,
				args.table,
				args.targetSize !== 128 ? args.targetSize : undefined
			);

			logger.log(
				`✨ Successfully enabled file compaction for table '${args.namespace}.${args.table}' in bucket '${args.bucket}'.`
			);
		} else {
			// Catalog-level compaction - token is required
			if (!args.token) {
				throw new UserError(
					"Token is required for catalog-level compaction. Use --token flag to provide a Cloudflare API token."
				);
			}

			await upsertR2CatalogCredential(
				config,
				accountId,
				args.bucket,
				args.token
			);

			await enableR2CatalogCompaction(
				config,
				accountId,
				args.bucket,
				args.targetSize
			);

			logger.log(
				`✨ Successfully enabled file compaction for the data catalog for bucket '${args.bucket}'.

Compaction will automatically combine small files into larger ones to improve query performance.
For more details, refer to: https://developers.cloudflare.com/r2/data-catalog/about-compaction/`
			);
		}
	},
});

export const r2BucketCatalogCompactionDisableCommand = createCommand({
	metadata: {
		description:
			"Disable automatic file compaction for your R2 data catalog or a specific table",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket", "namespace", "table"],
	args: {
		bucket: {
			describe: "The name of the bucket which contains the catalog",
			type: "string",
			demandOption: true,
		},
		namespace: {
			describe:
				"The namespace containing the table (optional, for table-level compaction)",
			type: "string",
			demandOption: false,
		},
		table: {
			describe: "The name of the table (optional, for table-level compaction)",
			type: "string",
			demandOption: false,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		// Validate namespace and table are provided together
		if (args.namespace && !args.table) {
			throw new UserError("Table name is required when namespace is specified");
		}
		if (!args.namespace && args.table) {
			throw new UserError("Namespace is required when table is specified");
		}

		if (args.namespace && args.table) {
			// Table-level compaction
			const confirmedDisable = await confirm(
				`Are you sure you want to disable file compaction for table '${args.namespace}.${args.table}' in bucket '${args.bucket}'?`
			);
			if (!confirmedDisable) {
				logger.log("Disable cancelled.");
				return;
			}

			await disableR2CatalogTableCompaction(
				config,
				accountId,
				args.bucket,
				args.namespace,
				args.table
			);

			logger.log(
				`Successfully disabled file compaction for table '${args.namespace}.${args.table}' in bucket '${args.bucket}'.`
			);
		} else {
			// Catalog-level compaction
			const confirmedDisable = await confirm(
				`Are you sure you want to disable file compaction for the data catalog for bucket '${args.bucket}'?`
			);
			if (!confirmedDisable) {
				logger.log("Disable cancelled.");
				return;
			}

			await disableR2CatalogCompaction(config, accountId, args.bucket);

			logger.log(
				`Successfully disabled file compaction for the data catalog for bucket '${args.bucket}'.`
			);
		}
	},
});

export const r2BucketCatalogSnapshotExpirationNamespace = createNamespace({
	metadata: {
		description:
			"Control settings for automatic snapshot expiration maintenance jobs for your R2 data catalog",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
});

export const r2BucketCatalogSnapshotExpirationEnableCommand = createCommand({
	metadata: {
		description:
			"Enable automatic snapshot expiration for your R2 data catalog or a specific table",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket", "namespace", "table"],
	args: {
		bucket: {
			describe: "The name of the bucket which contains the catalog",
			type: "string",
			demandOption: true,
		},
		namespace: {
			describe:
				"The namespace containing the table (optional, for table-level snapshot expiration)",
			type: "string",
			demandOption: false,
		},
		table: {
			describe:
				"The name of the table (optional, for table-level snapshot expiration)",
			type: "string",
			demandOption: false,
		},
		"older-than-days": {
			describe: "Delete snapshots older than this many days, defaults to 30",
			type: "number",
			demandOption: false,
		},
		"retain-last": {
			describe: "The minimum number of snapshots to retain, defaults to 5",
			type: "number",
			demandOption: false,
		},
		token: {
			describe:
				"A cloudflare api token with access to R2 and R2 Data Catalog (required for catalog-level snapshot expiration settings only)",
			demandOption: false,
			type: "string",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		// Validate namespace and table are provided together
		if (args.namespace && !args.table) {
			throw new UserError("Table name is required when namespace is specified");
		}
		if (!args.namespace && args.table) {
			throw new UserError("Namespace is required when table is specified");
		}

		if (args.namespace && args.table) {
			// Table-level snapshot expiration
			await enableR2CatalogTableSnapshotExpiration(
				config,
				accountId,
				args.bucket,
				args.namespace,
				args.table,
				args.olderThanDays,
				args.retainLast
			);

			logger.log(
				`✨ Successfully enabled snapshot expiration for table '${args.namespace}.${args.table}' in bucket '${args.bucket}'.`
			);
		} else {
			// Catalog-level snapshot expiration - token is required
			if (!args.token) {
				throw new UserError(
					"Token is required for catalog-level snapshot expiration. Use --token flag to provide a Cloudflare API token."
				);
			}

			await upsertR2CatalogCredential(
				config,
				accountId,
				args.bucket,
				args.token
			);

			await enableR2CatalogSnapshotExpiration(
				config,
				accountId,
				args.bucket,
				args.olderThanDays,
				args.retainLast
			);

			logger.log(
				`✨ Successfully enabled snapshot expiration for the data catalog for bucket '${args.bucket}'.

Snapshot expiration will automatically delete old table snapshots to save storage costs.
For more details, refer to: https://developers.cloudflare.com/r2/data-catalog/`
			);
		}
	},
});

export const r2BucketCatalogSnapshotExpirationDisableCommand = createCommand({
	metadata: {
		description:
			"Disable automatic snapshot expiration for your R2 data catalog or a specific table",
		status: "open beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket", "namespace", "table"],
	args: {
		bucket: {
			describe: "The name of the bucket which contains the catalog",
			type: "string",
			demandOption: true,
		},
		namespace: {
			describe:
				"The namespace containing the table (optional, for table-level snapshot expiration)",
			type: "string",
			demandOption: false,
		},
		table: {
			describe:
				"The name of the table (optional, for table-level snapshot expiration)",
			type: "string",
			demandOption: false,
		},
		force: {
			describe: "Skip confirmation prompt",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		// Validate namespace and table are provided together
		if (args.namespace && !args.table) {
			throw new UserError("Table name is required when namespace is specified");
		}
		if (!args.namespace && args.table) {
			throw new UserError("Namespace is required when table is specified");
		}

		if (args.namespace && args.table) {
			// Table-level snapshot expiration
			if (!args.force) {
				const confirmedDisable = await confirm(
					`Are you sure you want to disable snapshot expiration for table '${args.namespace}.${args.table}' in bucket '${args.bucket}'?`
				);
				if (!confirmedDisable) {
					logger.log("Disable cancelled.");
					return;
				}
			}

			await disableR2CatalogTableSnapshotExpiration(
				config,
				accountId,
				args.bucket,
				args.namespace,
				args.table
			);

			logger.log(
				`Successfully disabled snapshot expiration for table '${args.namespace}.${args.table}' in bucket '${args.bucket}'.`
			);
		} else {
			// Catalog-level snapshot expiration
			if (!args.force) {
				const confirmedDisable = await confirm(
					`Are you sure you want to disable snapshot expiration for the data catalog for bucket '${args.bucket}'?`
				);
				if (!confirmedDisable) {
					logger.log("Disable cancelled.");
					return;
				}
			}

			await disableR2CatalogSnapshotExpiration(config, accountId, args.bucket);

			logger.log(
				`Successfully disabled snapshot expiration for the data catalog for bucket '${args.bucket}'.`
			);
		}
	},
});
