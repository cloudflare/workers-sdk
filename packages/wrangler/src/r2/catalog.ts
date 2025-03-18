import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { getCloudflareApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import { APIError } from "../parse";
import { requireAuth } from "../user";
import {
	disableR2Catalog,
	enableR2Catalog,
	getR2Catalog,
	listR2Catalog,
} from "./helpers";

export const r2BucketCatalogNamespace = createNamespace({
	metadata: {
		description: "Manage R2 bucket warehouses using the R2 Data Catalog",
		status: "open-beta",
		owner: "Product: R2 Data Catalog",
	},
});

export const r2BucketCatalogEnableCommand = createCommand({
	metadata: {
		description: "Enable an R2 bucket as an Iceberg warehouse",
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

		const response = await enableR2Catalog(accountId, args.bucket);

		let catalog_host: string;
		const env = getCloudflareApiEnvironmentFromEnv();
		if (env === "staging") {
			catalog_host = `https://catalog-staging.cloudflarestorage.com/${response.name}`;
		} else {
			catalog_host = `https://catalog.cloudflarestorage.com/${response.name}`;
		}

		logger.log(
			`✨ Successfully enabled R2 bucket '${args.bucket}' as an Iceberg warehouse. Warehouse name: '${response.name}', id: '${response.id}'.

			To integrate with your Iceberg Client, please use the Catalog Uri: '${catalog_host}'.

			You will need a Cloudflare API token with 'R2 Data Catalog' permissions for your Iceberg Client to integrate with the Catalog.
			Please refer to https://developers.cloudflare.com/r2/api/s3/tokens/ for more details.`
		);
	},
});

export const r2BucketCatalogDisableCommand = createCommand({
	metadata: {
		description: "Disable R2 bucket as an Iceberg warehouse",
		status: "open-beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket to disable",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const confirmedDisable = await confirm(
			`Are you sure you want to disable the warehouse for bucket '${args.bucket}'? Please note that this action is irreversible, and you will not be able to re-enable the warehouse on the bucket.`
		);
		if (!confirmedDisable) {
			logger.log("Disable cancelled.");
			return;
		}

		await disableR2Catalog(accountId, args.bucket);

		logger.log(
			`✨ Successfully disabled R2 bucket '${args.bucket}' as an Iceberg warehouse.`
		);
	},
});

export const r2BucketCatalogGetCommand = createCommand({
	metadata: {
		description: "Check the status of the Iceberg warehouse on an R2 bucket",
		status: "open-beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket to check",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		try {
			logger.log(`Fetching warehouse status ...`);
			const warehouse = await getR2Catalog(accountId, args.bucket);
			logger.table([
				{
					id: warehouse.id,
					name: warehouse.name,
					bucket: warehouse.bucket,
					status: warehouse.status,
				},
			]);
		} catch (e) {
			// R2 Data Catalog 40401 corresponds to a 404
			if (e instanceof APIError && e.code == 40401) {
				logger.log(
					`No Catalog configuration found for the '${args.bucket}' bucket.`
				);
			} else {
				throw e;
			}
		}
	},
});

export const r2BucketCatalogListCommand = createCommand({
	metadata: {
		description: "List the R2 bucket warehouses for your account",
		status: "open-beta",
		owner: "Product: R2 Data Catalog",
	},
	positionalArgs: [],
	args: {},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		logger.log(`Fetching warehouses ...`);
		const warehouses = await listR2Catalog(accountId);

		if (warehouses.length === 0) {
			logger.info(`
		You haven't created any warehouses on this account.

		Use 'wrangler r2 catalog enable <bucket>' to enable one on your bucket.
				`);
			return;
		}

		logger.table(
			warehouses.map((warehouse) => ({
				id: warehouse.id,
				name: warehouse.name,
				bucket: warehouse.bucket,
				status: warehouse.status,
			}))
		);
	},
});
