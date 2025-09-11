import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { getCloudflareApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import { APIError } from "../parse";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	disableR2Catalog,
	disableR2CatalogCompaction,
	enableR2Catalog,
	enableR2CatalogCompaction,
	getR2Catalog,
} from "./helpers";

export const r2BucketCatalogNamespace = createNamespace({
	metadata: {
		description:
			"Manage the data catalog for your R2 buckets - provides an Iceberg REST interface for query engines like Spark and PyIceberg",
		status: "open-beta",
		owner: "Product: R2 Data Catalog",
	},
});

export const r2BucketCatalogEnableCommand = createCommand({
	metadata: {
		description: "Enable the data catalog on an R2 bucket",
		status: "open-beta",
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
		status: "open-beta",
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
		status: "open-beta",
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
			"Manage compaction maintenance for tables in your R2 data catalog",
		status: "private-beta",
		owner: "Product: R2 Data Catalog",
	},
});

export const r2BucketCatalogCompactionEnableCommand = createCommand({
	metadata: {
		description:
			"Enable compaction maintenance for a table in the R2 data catalog",
		status: "private-beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		},
		table: {
			describe: "The name of the table to enable compaction for",
			type: "string",
			demandOption: true,
		},
		namespace: {
			describe: "The namespace containing the table",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		await enableR2CatalogCompaction(
			config,
			accountId,
			args.bucket,
			args.namespace,
			args.table
		);

		logger.log(
			`✨ Successfully enabled compaction maintenance for table '${args.table}' in namespace '${args.namespace}' of bucket '${args.bucket}'.`
		);
	},
});

export const r2BucketCatalogCompactionDisableCommand = createCommand({
	metadata: {
		description:
			"Disable compaction maintenance for a table in the R2 data catalog",
		status: "private-beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		},
		table: {
			describe: "The name of the table to disable compaction for",
			type: "string",
			demandOption: true,
		},
		namespace: {
			describe: "The namespace containing the table",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const confirmedDisable = await confirm(
			`Are you sure you want to disable compaction maintenance for table '${args.table}' in namespace '${args.namespace}' of bucket '${args.bucket}'?`
		);
		if (!confirmedDisable) {
			logger.log("Disable cancelled.");
			return;
		}

		await disableR2CatalogCompaction(
			config,
			accountId,
			args.bucket,
			args.namespace,
			args.table
		);

		logger.log(
			`Successfully disabled compaction maintenance for table '${args.table}' in namespace '${args.namespace}' of bucket '${args.bucket}'.`
		);
	},
});
