import { readConfig } from "../config";
import { defineCommand, defineNamespace } from "../core";
import { CommandLineArgsError } from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import {
	createR2Bucket,
	deleteR2Bucket,
	isValidR2BucketName,
	listR2Buckets,
	updateR2BucketStorageClass,
} from "./helpers";

defineNamespace({
	command: "wrangler r2 bucket",

	metadata: {
		description: "Manage R2 buckets",
		status: "stable",
		owner: "Product: R2",
	},
});

defineCommand({
	command: "wrangler r2 bucket create",

	metadata: {
		description: "Create a new R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},

	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the new bucket",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the new bucket will be created",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		"storage-class": {
			describe: "The default storage class for objects uploaded to this bucket",
			alias: "s",
			requiresArg: false,
			type: "string",
		},
	},

	async handler(args) {
		if (!isValidR2BucketName(args.name)) {
			throw new CommandLineArgsError(
				`The bucket name "${args.name}" is invalid. Bucket names can only have alphanumeric and - characters.`
			);
		}

		const config = readConfig(args.config, args);

		const accountId = await requireAuth(config);

		let fullBucketName = `${args.name}`;
		if (args.jurisdiction !== undefined) {
			fullBucketName += ` (${args.jurisdiction})`;
		}

		let defaultStorageClass = ` with default storage class set to `;
		if (args.storageClass !== undefined) {
			defaultStorageClass += args.storageClass;
		} else {
			defaultStorageClass += "Standard";
		}

		logger.log(`Creating bucket ${fullBucketName}${defaultStorageClass}.`);
		await createR2Bucket(
			accountId,
			args.name,
			args.jurisdiction,
			args.storageClass
		);
		logger.log(`Created bucket ${fullBucketName}${defaultStorageClass}.`);
		await metrics.sendMetricsEvent("create r2 bucket", {
			sendMetrics: config.send_metrics,
		});
	},
});

defineNamespace({
	command: "wrangler r2 bucket update",

	metadata: {
		description: "Update bucket state",
		status: "stable",
		owner: "Product: R2",
	},
});

defineCommand({
	command: "wrangler r2 bucket update storage-class",

	metadata: {
		description: "Update the default storage class of an existing R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},

	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the existing bucket",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction of the bucket to be updated",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		"storage-class": {
			describe: "The new default storage class for this bucket",
			alias: "s",
			demandOption: true,
			requiresArg: true,
			type: "string",
		},
	},

	async handler(args) {
		const config = readConfig(args.config, args);

		const accountId = await requireAuth(config);

		let fullBucketName = `${args.name}`;
		if (args.jurisdiction !== undefined) {
			fullBucketName += ` (${args.jurisdiction})`;
		}
		logger.log(
			`Updating bucket ${fullBucketName} to ${args.storageClass} default storage class.`
		);
		await updateR2BucketStorageClass(
			accountId,
			args.name,
			args.storageClass,
			args.jurisdiction
		);
		logger.log(
			`Updated bucket ${fullBucketName} to ${args.storageClass} default storage class.`
		);
	},
});

defineCommand({
	command: "wrangler r2 bucket list",

	metadata: {
		description: "List R2 buckets",
		status: "stable",
		owner: "Product: R2",
	},

	args: {
		jurisdiction: {
			describe: "The jurisdiction to list",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},

	async handler(args) {
		const config = readConfig(args.config, args);
		const { jurisdiction } = args;

		const accountId = await requireAuth(config);

		logger.log(
			JSON.stringify(await listR2Buckets(accountId, jurisdiction), null, 2)
		);
		await metrics.sendMetricsEvent("list r2 buckets", {
			sendMetrics: config.send_metrics,
		});
	},
});

defineCommand({
	command: "wrangler r2 bucket delete",

	metadata: {
		description: "Delete an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},

	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the bucket to delete",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},

	async handler(args) {
		const config = readConfig(args.config, args);

		const accountId = await requireAuth(config);

		let fullBucketName = `${args.name}`;
		if (args.jurisdiction !== undefined) {
			fullBucketName += ` (${args.jurisdiction})`;
		}
		logger.log(`Deleting bucket ${fullBucketName}.`);
		await deleteR2Bucket(accountId, args.name, args.jurisdiction);
		logger.log(`Deleted bucket ${fullBucketName}.`);
		await metrics.sendMetricsEvent("delete r2 bucket", {
			sendMetrics: config.send_metrics,
		});
	},
});
