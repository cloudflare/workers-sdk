import { readConfig } from "../config";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	attachCustomDomainToBucket,
	configureCustomDomainSettings,
	listCustomDomainsOfBucket,
	removeCustomDomainFromBucket,
	tableFromCustomDomainListResponse,
} from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function ListOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe:
				"The name of the R2 bucket whose connected custom domains will be listed",
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

export async function ListHandler(
	args: StrictYargsOptionsToInterface<typeof ListOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const { bucket, jurisdiction } = args;

	logger.log(`Listing custom domains connected to bucket '${bucket}'...`);

	const domains = await listCustomDomainsOfBucket(
		accountId,
		bucket,
		jurisdiction
	);

	if (domains.length === 0) {
		logger.log("There are no custom domains connected to this bucket.");
	} else {
		const tableOutput = tableFromCustomDomainListResponse(domains);
		logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
	}
}

export function AddOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe: "The name of the R2 bucket to connect a custom domain to",
			type: "string",
			demandOption: true,
		})
		.option("domain", {
			describe: "The custom domain to connect to the R2 bucket",
			type: "string",
			demandOption: true,
		})
		.option("zone-id", {
			describe: "The zone ID associated with the custom domain",
			type: "string",
			demandOption: true,
		})
		.option("enabled", {
			describe:
				"Whether to enable public access at the custom domain (default is enabled)",
			type: "boolean",
		})
		.option("min-tls", {
			describe:
				"Set the minimum TLS version for the custom domain (defaults to 1.0 if not set)",
			choices: ["1.0", "1.1", "1.2", "1.3"],
			type: "string",
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		});
}

export async function AddHandler(
	args: StrictYargsOptionsToInterface<typeof AddOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const {
		bucket,
		domain,
		zoneId,
		enabled = true,
		minTls = "1.0",
		jurisdiction,
	} = args;

	logger.log(`Connecting custom domain '${domain}' to bucket '${bucket}'...`);

	await attachCustomDomainToBucket(
		accountId,
		bucket,
		{
			domain,
			zoneId,
			enabled,
			minTLS: minTls,
		},
		jurisdiction
	);

	logger.log(`✨ Custom domain '${domain}' connected successfully.`);
}

export function RemoveOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe: "The name of the R2 bucket to remove the custom domain from",
			type: "string",
			demandOption: true,
		})
		.option("domain", {
			describe: "The custom domain to remove from the R2 bucket",
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

export async function RemoveHandler(
	args: StrictYargsOptionsToInterface<typeof RemoveOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const { bucket, domain, jurisdiction } = args;

	logger.log(`Removing custom domain '${domain}' from bucket '${bucket}'...`);

	await removeCustomDomainFromBucket(accountId, bucket, domain, jurisdiction);

	logger.log(`Custom domain '${domain}' removed successfully.`);
}

export function UpdateOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe:
				"The name of the R2 bucket associated with the custom domain to update",
			type: "string",
			demandOption: true,
		})
		.option("domain", {
			describe: "The custom domain whose settings will be updated",
			type: "string",
			demandOption: true,
		})
		.option("enabled", {
			describe: "Enable or disable public access at the custom domain",
			type: "boolean",
		})
		.option("min-tls", {
			describe: "Update the minimum TLS version for the custom domain",
			choices: ["1.0", "1.1", "1.2", "1.3"],
			type: "string",
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		});
}

export async function UpdateHandler(
	args: StrictYargsOptionsToInterface<typeof UpdateOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const { bucket, domain, enabled, minTls, jurisdiction } = args;

	logger.log(`Updating custom domain '${domain}' for bucket '${bucket}'...`);

	await configureCustomDomainSettings(
		accountId,
		bucket,
		domain,
		{
			domain,
			enabled,
			minTLS: minTls,
		},
		jurisdiction
	);

	logger.log(`✨ Custom domain '${domain}' updated successfully.`);
}
