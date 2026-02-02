import { createCommand, createNamespace } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import {
	getR2LocalUploadsConfig,
	setR2LocalUploadsConfig,
} from "./helpers/local-uploads";

export const r2BucketLocalUploadsNamespace = createNamespace({
	metadata: {
		description: "Manage local uploads configuration for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketLocalUploadsGetConfigCommand = createCommand({
	metadata: {
		description: "Get the local uploads configuration for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the R2 bucket whose local uploads configuration to retrieve",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const { bucket } = args;

		const localUploads = await getR2LocalUploadsConfig(
			config,
			accountId,
			bucket
		);

		if (localUploads.enabled) {
			logger.log(
				`Local uploads are enabled for bucket '${bucket}'. Object data is written to the nearest region first, then asynchronously replicated to the bucket's primary region.`
			);
		} else {
			logger.log(
				`Local uploads are disabled for bucket '${bucket}'. Object data is written directly to the bucket's primary region.`
			);
		}
	},
});

export const r2BucketLocalUploadsEnableCommand = createCommand({
	metadata: {
		description: "Enable local uploads for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to enable local uploads",
			type: "string",
			demandOption: true,
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

		const { bucket, force } = args;

		if (!force) {
			const confirmedEnable = await confirm(
				`Are you sure you want to enable local uploads for bucket '${bucket}'? ` +
					`Object data will be written to the nearest region first, then asynchronously replicated to the bucket's primary region.`
			);
			if (!confirmedEnable) {
				logger.log("Enable cancelled.");
				return;
			}
		}

		logger.log(`Enabling local uploads for bucket '${bucket}'...`);

		await setR2LocalUploadsConfig(config, accountId, bucket, true);

		logger.log(`✨ Local uploads enabled for bucket '${bucket}'.`);
	},
});

export const r2BucketLocalUploadsDisableCommand = createCommand({
	metadata: {
		description: "Disable local uploads for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to disable local uploads",
			type: "string",
			demandOption: true,
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

		const { bucket, force } = args;

		if (!force) {
			const confirmedDisable = await confirm(
				`Are you sure you want to disable local uploads for bucket '${bucket}'? ` +
					`Object data will be written directly to the bucket's primary region.`
			);
			if (!confirmedDisable) {
				logger.log("Disable cancelled.");
				return;
			}
		}

		logger.log(`Disabling local uploads for bucket '${bucket}'...`);

		await setR2LocalUploadsConfig(config, accountId, bucket, false);

		logger.log(`Local uploads disabled for bucket '${bucket}'.`);
	},
});
