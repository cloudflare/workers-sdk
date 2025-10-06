import {
	cancel,
	endSection,
	log,
	startSection,
	updateStatus,
} from "@cloudflare/cli";
import {
	ApiError,
	getAndValidateRegistryType,
	ImageRegistriesService,
} from "@cloudflare/containers-shared";
import { ExternalRegistryKind } from "@cloudflare/containers-shared/src/client/models/ExternalRegistryKind";
import { handleFailure, promiseSpinner } from "../cloudchamber/common";
import { confirm, prompt } from "../dialogs";
import { FatalError, UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { parseJSON } from "../parse";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import { formatError } from "./deploy";
import { containersScope } from ".";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export const registryCommands = (yargs: CommonYargsArgv) => {
	return yargs
		.command(
			"put <DOMAIN>",
			"Add credentials for a non-Cloudflare container registry",
			(args) => registryPutYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers registry put`,
					registryPutCommand,
					containersScope
				)(args)
		)
		.command(
			"list",
			"List all configured container registries",
			(args) => registryListYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers registry list`,
					registryListCommand,
					containersScope
				)(args)
		)
		.command(
			"delete <DOMAIN>",
			"Delete a configured container registry",
			(args) => registryDeleteYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers registry delete`,
					registryDeleteCommand,
					containersScope
				)(args)
		);
};
function registryPutYargs(args: CommonYargsArgv) {
	return args.positional("DOMAIN", {
		describe: "domain to configure for the registry",
		type: "string",
		demandOption: true,
	});
}

async function registryPutCommand(
	configureArgs: StrictYargsOptionsToInterface<typeof registryPutYargs>
) {
	startSection("Configure container registry");

	const registryType = getAndValidateRegistryType(configureArgs.DOMAIN);

	log(`Configuring ${registryType.name} registry: ${configureArgs.DOMAIN}\n`);

	let credentials: Record<string, string> = {};
	switch (registryType.type) {
		case "cloudflare":
			log(
				"You do not need to configure credentials for Cloudflare managed registries.\n"
			);
			endSection("No configuration required");
			return;
		case ExternalRegistryKind.ECR:
			credentials = await configureAwsEcrRegistry(configureArgs.DOMAIN);
			break;
		default:
			throw new Error(`Unhandled registry type: ${registryType.type}`);
	}
	try {
		await promiseSpinner(
			ImageRegistriesService.createImageRegistry({
				domain: configureArgs.DOMAIN,
				is_public: false,
				auth: JSON.stringify(credentials),
				kind: registryType.type,
			})
		);
	} catch (e) {
		if (e instanceof ApiError) {
			if (e.status === 409) {
				throw new UserError(
					`A registry with the domain ${configureArgs.DOMAIN} already exists. Use "wrangler containers registry delete ${configureArgs.DOMAIN}" to delete it first if you want to reconfigure it.`
				);
			}
			throw new FatalError(
				"Error configuring container registry:\n" + formatError(e)
			);
		} else {
			throw e;
		}
	}

	endSection("Registry configuration completed");
}
async function configureAwsEcrRegistry(domain: string) {
	let credentials: {
		AWS_ACCESS_KEY_ID?: string;
		AWS_SECRET_ACCESS_KEY?: string;
	} = {};
	if (isNonInteractiveOrCI()) {
		// Non-interactive mode: expect JSON input via stdin
		log("Reading AWS credentials from stdin...\n");

		const stdinInput = trimTrailingWhitespace(await readFromStdin());
		if (!stdinInput) {
			throw new UserError(
				"No input provided. In non-interactive mode, please pipe AWS credentials as JSON:\n" +
					'echo \'{"AWS_ACCESS_KEY_ID":"...","AWS_SECRET_ACCESS_KEY":"..."}\' | wrangler containers registry put ' +
					domain
			);
		}

		try {
			credentials = parseJSON(stdinInput) as {
				AWS_ACCESS_KEY_ID?: string;
				AWS_SECRET_ACCESS_KEY?: string;
			};
		} catch {
			throw new UserError(
				"Invalid JSON input. Please provide AWS credentials in this format:\n" +
					'{"AWS_ACCESS_KEY_ID":"your-access-key","AWS_SECRET_ACCESS_KEY":"your-secret-key"}'
			);
		}
	} else {
		log(
			"Please provide an AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to configure this ECR registry.\n"
		);
		credentials["AWS_ACCESS_KEY_ID"] = await prompt("AWS_ACCESS_KEY_ID:", {
			isSecret: false,
		});
		credentials["AWS_SECRET_ACCESS_KEY"] = await prompt(
			"AWS_SECRET_ACCESS_KEY:",
			{
				isSecret: true,
			}
		);
	}

	if (!credentials.AWS_ACCESS_KEY_ID || !credentials.AWS_SECRET_ACCESS_KEY) {
		throw new UserError(
			"Missing required credentials. JSON must include both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY."
		);
	}
	return credentials;
}

function registryListYargs(args: CommonYargsArgv) {
	return args.option("json", {
		type: "boolean",
		description: "Format output as JSON",
		default: false,
	});
}

async function registryListCommand(
	listArgs: StrictYargsOptionsToInterface<typeof registryListYargs>
) {
	if (!listArgs.json && !isNonInteractiveOrCI()) {
		startSection("List configured container registries");
	}

	try {
		const res = await promiseSpinner(
			ImageRegistriesService.listImageRegistries()
		);
		if (listArgs.json || isNonInteractiveOrCI()) {
			logger.json(res);
		} else if (res.length === 0) {
			endSection("No registries configured for this account");
		} else {
			res.forEach((registry) => {
				updateStatus(registry.domain);
			});
			endSection(`End`);
		}
	} catch (e) {
		if (e instanceof ApiError) {
			throw new FatalError(
				"Error listing container registries:\n" + formatError(e)
			);
		} else {
			throw e;
		}
	}
}

const registryDeleteYargs = (yargs: CommonYargsArgv) => {
	return yargs
		.positional("DOMAIN", {
			describe: "domain of the registry to delete",
			type: "string",
			demandOption: true,
		})
		.option("skip-confirmation", {
			type: "boolean",
			description: "Skip confirmation prompt",
			alias: "y",
			default: false,
		});
};
async function registryDeleteCommand(
	deleteArgs: StrictYargsOptionsToInterface<typeof registryDeleteYargs>
) {
	startSection(`Delete registry ${deleteArgs.DOMAIN}`);

	if (!deleteArgs.skipConfirmation) {
		const yes = await confirm(
			`Are you sure you want to delete the registry ${deleteArgs.DOMAIN}? This action cannot be undone.`
		);
		if (!yes) {
			cancel("The operation has been cancelled");
			return;
		}
	}

	try {
		await promiseSpinner(
			ImageRegistriesService.deleteImageRegistry(deleteArgs.DOMAIN)
		);
	} catch (e) {
		if (e instanceof ApiError) {
			if (e.status === 404) {
				throw new UserError(
					`The registry ${deleteArgs.DOMAIN} does not exist.`
				);
			}
			throw new FatalError(
				`Error deleting container registry:\n` + formatError(e)
			);
		} else {
			throw e;
		}
	}

	endSection(`Deleted registry ${deleteArgs.DOMAIN}\n`);
}
