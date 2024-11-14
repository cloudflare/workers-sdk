import { readConfig } from "../config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { requireAuth } from "../user";
import { getR2DevDomain, updateR2DevDomain } from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function GetOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe: "The name of the R2 bucket whose r2.dev URL status to retrieve",
			type: "string",
			demandOption: true,
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		});
}

export async function GetHandler(
	args: StrictYargsOptionsToInterface<typeof GetOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const { bucket, jurisdiction } = args;

	const devDomain = await getR2DevDomain(accountId, bucket, jurisdiction);

	if (devDomain.enabled) {
		logger.log(`Public access is enabled at 'https://${devDomain.domain}'.`);
	} else {
		logger.log(`Public access via the r2.dev URL is disabled.`);
	}
}

export function EnableOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe:
				"The name of the R2 bucket to enable public access via its r2.dev URL",
			type: "string",
			demandOption: true,
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		})
		.option("force", {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		});
}

export async function EnableHandler(
	args: StrictYargsOptionsToInterface<typeof EnableOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
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
		accountId,
		bucket,
		true,
		jurisdiction
	);

	logger.log(`✨ Public access enabled at 'https://${devDomain.domain}'.`);
}

export function DisableOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe:
				"The name of the R2 bucket to disable public access via its r2.dev URL",
			type: "string",
			demandOption: true,
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		})
		.option("force", {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		});
}

export async function DisableHandler(
	args: StrictYargsOptionsToInterface<typeof DisableOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
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
		accountId,
		bucket,
		false,
		jurisdiction
	);

	logger.log(`Public access disabled at 'https://${devDomain.domain}'.`);
}
