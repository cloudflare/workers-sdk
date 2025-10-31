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
import { APIError, UserError } from "@cloudflare/workers-utils";
import { handleFailure, promiseSpinner } from "../cloudchamber/common";
import { confirm, prompt } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { createSecret, createStore, listStores } from "../secrets-store/client";
import { validateSecretName } from "../secrets-store/commands";
import { getAccountId } from "../user";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import { formatError } from "./deploy";
import { containersScope } from ".";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Config } from "@cloudflare/workers-utils";

export const registryCommands = (yargs: CommonYargsArgv) => {
	return yargs
		.command(
			"configure <DOMAIN>",
			"Configure credentials for a non-Cloudflare container registry",
			(args) => registryConfigureYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers registries configure`,
					registryConfigureCommand,
					containersScope
				)(args)
		)
		.command(
			"list",
			"List all configured container registries",
			(args) => registryListYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers registries list`,
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
					`wrangler containers registries delete`,
					registryDeleteCommand,
					containersScope
				)(args)
		);
};
function registryConfigureYargs(args: CommonYargsArgv) {
	return (
		args
			.positional("DOMAIN", {
				describe: "Domain to configure for the registry",
				type: "string",
				demandOption: true,
			})
			// TODO: we will need to allow users to specify a pre-existing secret store integration
			// but for now wrangler will create a new secret store secret
			.option("identifier", {
				type: "string",
				description:
					"The public part of the registry credentials, e.g. `AWS_ACCESS_KEY_ID` for ECR",
				demandOption: true,
				alias: "id",
			})
			.option("secret-store-id", {
				type: "string",
				description:
					"The ID of the secret store to use to store the registry credentials.",
				demandOption: false,
			})
			// TODO: allow users to provide an existing secret name
			// but then we can't get secrets by name, only id, so we would need to list all secrets and find the right one
			.option("secret-name", {
				type: "string",
				description:
					"The name Wrangler should store the registry credentials under.",
				demandOption: false,
			})
	);
}

async function registryConfigureCommand(
	configureArgs: StrictYargsOptionsToInterface<typeof registryConfigureYargs>,
	config: Config
) {
	startSection("Configure a container registry");

	const registryType = getAndValidateRegistryType(configureArgs.DOMAIN);

	log(`Configuring ${registryType.name} registry: ${configureArgs.DOMAIN}\n`);

	if (configureArgs.secretName) {
		validateSecretName(configureArgs.secretName);
	}
	let secret: string;
	switch (registryType.type) {
		case "cloudflare":
			log(
				"You do not need to configure credentials for Cloudflare managed registries.\n"
			);
			endSection("No configuration required");
			return;
		// this can be extended to any registry type that requires credentials
		case ExternalRegistryKind.ECR:
			log(`Getting ${registryType.secretName}...\n`);
			secret = await getSecret();
			break;
		default:
			throw new UserError(`Unhandled registry type: ${registryType.type}`);
	}

	log("\n");
	log("Setting up integration with Secrets Store...\n");
	const accountId = await getAccountId(config);
	let secretStoreId = configureArgs.secretStoreId;
	if (!secretStoreId) {
		const stores = await listStores(config, accountId);
		if (stores.length === 0) {
			const check = await confirm(
				`No existing secret stores found. Create a secret store to store your registry credentials?`
			);
			if (!check) {
				endSection("Cancelled.");
				return;
			}
			const res = await promiseSpinner(
				// should we allow users to specify the name of the store?
				createStore(config, accountId, { name: "Default" })
			);
			log("New secret store `Default` created with id: " + res.id);
			secretStoreId = res.id;
		} else if (stores.length > 1) {
			// note you can only have one secret store per account for now
			throw new UserError(
				`Multiple secret stores found. Please specify a secret store ID using --secret-store-id.`
			);
		} else {
			secretStoreId = stores[0].id;
			log(
				`Using existing secret store ${stores[0].name} with id: ${stores[0].id}`
			);
		}
	}
	log("\n");
	let secretName = configureArgs.secretName;
	while (!secretName) {
		try {
			const res = await prompt(
				`Please provide a name for the secret to store the registry credentials:`,
				{ defaultValue: `${registryType.secretName?.replaceAll(" ", "_")}` }
			);
			validateSecretName(res);
			secretName = res;
		} catch (e) {
			log((e as Error).message);
			continue;
		}
	}

	await promiseSpinner(
		createSecret(config, accountId, secretStoreId, {
			name: secretName,
			value: secret,
			scopes: ["containers"],
			comment: `Created by Wrangler: credentials for image registry ${configureArgs.DOMAIN}`,
		})
	);
	log(`Container-scoped secret ${secretName} created in Secrets Store.\n`);

	try {
		await promiseSpinner(
			ImageRegistriesService.createImageRegistry({
				domain: configureArgs.DOMAIN,
				is_public: false,
				auth: {
					identifier: configureArgs.identifier,
					secrets_integration: {
						store_id: secretStoreId,
						secret_name: secretName,
					},
				},
				kind: registryType.type,
			})
		);
	} catch (e) {
		if (e instanceof ApiError) {
			if (e.status === 409) {
				throw new UserError(
					`A registry with the domain ${configureArgs.DOMAIN} already exists. Use "wrangler containers registries delete ${configureArgs.DOMAIN}" to delete it first if you want to reconfigure it.`
				);
			}
			throw new APIError({
				status: e.status,
				text: "Error configuring container registry:\n" + formatError(e),
			});
		} else {
			throw e;
		}
	}

	endSection("Registry configuration completed");
}

async function getSecret(): Promise<string> {
	if (isNonInteractiveOrCI()) {
		// Non-interactive mode: expect JSON input via stdin
		const stdinInput = trimTrailingWhitespace(await readFromStdin());
		if (!stdinInput) {
			throw new UserError(
				"No input provided. In non-interactive mode, please pipe in the secret."
			);
		}
		return stdinInput;
	}
	const secret = await prompt(`Enter secret:`, {
		isSecret: true,
	});
	if (!secret) {
		throw new UserError("Secret cannot be empty.");
	}
	return secret;
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
			throw new APIError({
				status: e.status,
				text: "Error listing container registries:\n" + formatError(e),
			});
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
			`Are you sure you want to delete the registry credentials for ${deleteArgs.DOMAIN}? This action cannot be undone.`
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
			throw new APIError({
				status: e.status,
				text: `Error deleting container registry:\n` + formatError(e),
			});
		} else {
			throw e;
		}
	}

	endSection(`Deleted registry ${deleteArgs.DOMAIN}\n`);
}
