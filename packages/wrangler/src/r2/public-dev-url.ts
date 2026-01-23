import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { getR2DevDomain, updateR2DevDomain } from "./helpers/domain";

export const r2BucketDevUrlNamespace = createNamespace({
	metadata: {
		description: "Manage public access via the r2.dev URL for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketDevUrlGetCommand = createCommand({
	metadata: {
		description: "Get the r2.dev URL and status for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket whose r2.dev URL status to retrieve",
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
		const accountId = await requireAuth(config);

		const { bucket, jurisdiction } = args;

		const devDomain = await getR2DevDomain(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		if (devDomain.enabled) {
			logger.log(`Public access is enabled at 'https://${devDomain.domain}'.`);
		} else {
			logger.log(`Public access via the r2.dev URL is disabled.`);
		}
	},
});

export const r2BucketDevUrlEnableCommand = createCommand({
	metadata: {
		description: "Enable public access via the r2.dev URL for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the R2 bucket to enable public access via its r2.dev URL",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const { bucket, jurisdiction, force } = args;

		if (!force) {
			const confirmedAdd = await confirm(
				`Are you sure you enable public access for bucket '${bucket}'? ` +
					`The contents of your bucket will be made publicly available at its r2.dev URL`
			);
			if (!confirmedAdd) {
				logger.log("Enable cancelled.");
				return;
			}
		}

		logger.log(`Enabling public access for bucket '${bucket}'...`);

		const devDomain = await updateR2DevDomain(
			config,
			accountId,
			bucket,
			true,
			jurisdiction
		);

		logger.log(`✨ Public access enabled at 'https://${devDomain.domain}'.`);
	},
});

export const r2BucketDevUrlDisableCommand = createCommand({
	metadata: {
		description: "Disable public access via the r2.dev URL for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the R2 bucket to disable public access via its r2.dev URL",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const { bucket, jurisdiction, force } = args;

		if (!force) {
			const confirmedAdd = await confirm(
				`Are you sure you disable public access for bucket '${bucket}'? ` +
					`The contents of your bucket will no longer be publicly available at its r2.dev URL`
			);
			if (!confirmedAdd) {
				logger.log("Disable cancelled.");
				return;
			}
		}

		logger.log(`Disabling public access for bucket '${bucket}'...`);

		const devDomain = await updateR2DevDomain(
			config,
			accountId,
			bucket,
			false,
			jurisdiction
		);

		logger.log(`Public access disabled at 'https://${devDomain.domain}'.`);
	},
});
