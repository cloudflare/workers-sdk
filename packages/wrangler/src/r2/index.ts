import { defineCommand, defineNamespace } from "../core";
import { UserError } from "../errors";
import { printWranglerBanner } from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { LOCATION_CHOICES } from "./constants";
import "./object";
import "./sippy";
import "./notification";
import "./domain";
import "./public-dev-url";
import {
	createR2Bucket,
	deleteR2Bucket,
	isValidR2BucketName,
	listR2Buckets,
	updateR2BucketStorageClass,
} from "./helpers";
import * as Info from "./info";
import * as Lifecycle from "./lifecycle";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";

defineNamespace({
	command: "wrangler r2",
	metadata: {
		description: "📦 Manage R2 buckets & objects",
		status: "stable",
		owner: "Product: R2",
	},
});

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
		location: {
			describe:
				"The optional location hint that determines geographic placement of the R2 bucket",
			choices: LOCATION_CHOICES,
			requiresArg: true,
			type: "string",
		},
		"storage-class": {
			describe: "The default storage class for objects uploaded to this bucket",
			alias: "s",
			requiresArg: false,
			type: "string",
		},
		jurisdiction: {
			describe: "The jurisdiction where the new bucket will be created",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	async handler(args, { config }) {
		await printWranglerBanner();
		const accountId = await requireAuth(config);
		const { name, location, storageClass, jurisdiction } = args;

		if (!isValidR2BucketName(name)) {
			throw new UserError(
				`The bucket name "${name}" is invalid. Bucket names can only have alphanumeric and - characters.`
			);
		}

		if (jurisdiction && location) {
			throw new UserError(
				"Provide either a jurisdiction or location hint - not both."
			);
		}

		let fullBucketName = `${name}`;
		if (jurisdiction !== undefined) {
			fullBucketName += ` (${jurisdiction})`;
		}

		logger.log(`Creating bucket '${fullBucketName}'...`);
		await createR2Bucket(accountId, name, location, jurisdiction, storageClass);
		logger.log(
			`✅ Created bucket '${fullBucketName}' with${
				location ? ` location hint ${location} and` : ``
			} default storage class of ${storageClass ? storageClass : `Standard`}.`
		);
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
	async handler(args, { config }) {
		await printWranglerBanner();

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
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		logger.log(
			JSON.stringify(await listR2Buckets(accountId, args.jurisdiction), null, 2)
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
	async handler(args, { config }) {
		await printWranglerBanner();

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

export function r2(r2Yargs: CommonYargsArgv, subHelp: SubHelp) {
	return r2Yargs
		.command(subHelp)
		.command("bucket", "Manage R2 buckets", (r2BucketYargs) => {
			r2BucketYargs.demandCommand();

			r2BucketYargs.command(
				"info <bucket>",
				"Get information about an R2 bucket",
				Info.InfoOptions,
				Info.InfoHandler
			);

			r2BucketYargs.command(
				"lifecycle",
				"Manage lifecycle rules for an R2 bucket",
				(lifecycleYargs) => {
					return lifecycleYargs
						.command(
							"list <bucket>",
							"List lifecycle rules for an R2 bucket",
							Lifecycle.ListOptions,
							Lifecycle.ListHandler
						)
						.command(
							"add <bucket>",
							"Add a lifecycle rule to an R2 bucket",
							Lifecycle.AddOptions,
							Lifecycle.AddHandler
						)
						.command(
							"remove <bucket>",
							"Remove a lifecycle rule from an R2 bucket",
							Lifecycle.RemoveOptions,
							Lifecycle.RemoveHandler
						)
						.command(
							"set <bucket>",
							"Set the lifecycle configuration for an R2 bucket from a JSON file",
							Lifecycle.SetOptions,
							Lifecycle.SetHandler
						);
				}
			);
			return r2BucketYargs;
		});
}
