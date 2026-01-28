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
import {
	APIError,
	getCloudflareComplianceRegion,
	UserError,
} from "@cloudflare/workers-utils";
import {
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import { createCommand, createNamespace } from "../core/create-command";
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
import type { ImageRegistryAuth } from "@cloudflare/containers-shared/src/client/models/ImageRegistryAuth";
import type { Config } from "@cloudflare/workers-utils";

function _registryConfigureYargs(args: CommonYargsArgv) {
	return (
		args
			.positional("DOMAIN", {
				describe: "Domain to configure for the registry",
				type: "string",
				demandOption: true,
			})
			.option("public-credential", {
				type: "string",
				description:
					"The public part of the registry credentials, e.g. `AWS_ACCESS_KEY_ID` for ECR",
				demandOption: true,
				alias: ["aws-access-key-id"],
			})
			.option("secret-store-id", {
				type: "string",
				description:
					"The ID of the secret store to use to store the registry credentials.",
				demandOption: false,
				conflicts: ["disableSecretsStore"],
			})
			// TODO: allow users to provide an existing secret name
			// but then we can't get secrets by name, only id, so we would need to list all secrets and find the right one
			.option("secret-name", {
				type: "string",
				description:
					"The name for the secret the private registry credentials should be stored under.",
				demandOption: false,
				conflicts: ["disableSecretsStore"],
			})
			.option("disableSecretsStore", {
				type: "boolean",
				description:
					"Whether to disable secrets store integration. This should be set iff the compliance region is FedRAMP High.",
				demandOption: false,
				conflicts: ["secret-store-id", "secret-name"],
			})
	);
}

async function registryConfigureCommand(
	configureArgs: StrictYargsOptionsToInterface<typeof _registryConfigureYargs>,
	config: Config
) {
	startSection("Configure a container registry");

	const registryType = getAndValidateRegistryType(configureArgs.DOMAIN);

	log(`Configuring ${registryType.name} registry: ${configureArgs.DOMAIN}\n`);

	if (registryType.type === "cloudflare") {
		log(
			"You do not need to configure credentials for Cloudflare managed registries.\n"
		);
		endSection("No configuration required");
		return;
	}

	const isFedRAMPHigh =
		getCloudflareComplianceRegion(config) === "fedramp_high";
	if (isFedRAMPHigh) {
		if (!configureArgs.disableSecretsStore) {
			throw new UserError(
				"Secrets Store is not supported in FedRAMP compliance regions. You must set --disableSecretsStore."
			);
		}
	} else {
		if (configureArgs.disableSecretsStore) {
			throw new UserError(
				"Secrets Store can only be disabled in FedRAMP compliance regions."
			);
		}
	}

	let secretStoreId = configureArgs.secretStoreId;
	let secretName = configureArgs.secretName;
	if (configureArgs.secretName) {
		validateSecretName(configureArgs.secretName);
	}

	log(`Getting ${registryType.secretType}...\n`);
	const secret = await getSecret(registryType.secretType);

	// Secret Store is not available in FedRAMP High
	let private_credential: ImageRegistryAuth["private_credential"];
	if (!isFedRAMPHigh) {
		log("\nSetting up integration with Secrets Store...\n");
		const accountId = await getAccountId(config);

		if (!secretStoreId) {
			const stores = await listStores(config, accountId);
			if (stores.length === 0) {
				const defaultStoreName = "default_secret_store";
				const yes = await confirm(
					`No existing Secret Stores found. Create a Secret Store to store your registry credentials?`
				);
				if (!yes) {
					endSection("Cancelled.");
					return;
				}
				const res = await promiseSpinner(
					createStore(config, accountId, { name: defaultStoreName })
				);
				log(`New Secret Store ${defaultStoreName} created with id: ${res.id}`);
				secretStoreId = res.id;
			} else if (stores.length > 1) {
				// note you can only have one secret store per account for now
				throw new UserError(
					`Multiple Secret Stores found. Please specify a Secret Store ID using --secret-store-id.`
				);
			} else {
				secretStoreId = stores[0].id;
				log(
					`Using existing Secret Store ${stores[0].name} with id: ${stores[0].id}`
				);
			}
		}

		log("\n");

		while (!secretName) {
			try {
				const res = await prompt(`Secret name:`, {
					defaultValue: `${registryType.secretType?.replaceAll(" ", "_")}`,
				});

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
		private_credential = {
			store_id: secretStoreId,
			secret_name: secretName,
		};
		log(`Container-scoped secret ${secretName} created in Secrets Store.\n`);
	} else {
		// If we are not using the secret store, we will be passing in the secret directly
		private_credential = secret;
	}

	try {
		await promiseSpinner(
			ImageRegistriesService.createImageRegistry({
				domain: configureArgs.DOMAIN,
				is_public: false,
				auth: {
					public_credential: configureArgs.publicCredential,
					private_credential,
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

async function getSecret(secretType?: string): Promise<string> {
	if (isNonInteractiveOrCI()) {
		// Non-interactive mode: expect JSON input via stdin
		const stdinInput = trimTrailingWhitespace(await readFromStdin());
		if (!stdinInput) {
			throw new UserError(
				`No input provided. In non-interactive mode, please pipe in the ${secretType} secret via stdin.`
			);
		}
		return stdinInput;
	}
	const secret = await prompt(`Enter ${secretType ?? "secret"}:`, {
		isSecret: true,
	});
	if (!secret) {
		throw new UserError("Secret cannot be empty.");
	}
	return secret;
}

function _registryListYargs(args: CommonYargsArgv) {
	return args.option("json", {
		type: "boolean",
		description: "Format output as JSON",
		default: false,
	});
}

async function registryListCommand(
	listArgs: StrictYargsOptionsToInterface<typeof _registryListYargs>
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

// Only used for its type. The underscore prefix prevents unused variable linting errors.
const _registryDeleteYargs = (yargs: CommonYargsArgv) => {
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
	deleteArgs: StrictYargsOptionsToInterface<typeof _registryDeleteYargs>
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

export const containersRegistriesNamespace = createNamespace({
	metadata: {
		description: "Configure and manage non-Cloudflare registries",
		status: "open beta",
		owner: "Product: Cloudchamber",
		hidden: true,
	},
});

export const containersRegistriesConfigureCommand = createCommand({
	metadata: {
		description:
			"Configure credentials for a non-Cloudflare container registry",
		status: "open beta",
		owner: "Product: Cloudchamber",
		hidden: true,
	},
	args: {
		DOMAIN: {
			describe: "Domain to configure for the registry",
			type: "string",
			demandOption: true,
		},
		"public-credential": {
			type: "string",
			description:
				"The public part of the registry credentials, e.g. `AWS_ACCESS_KEY_ID` for ECR",
			demandOption: true,
			alias: "aws-access-key-id",
		},
		"secret-store-id": {
			type: "string",
			description:
				"The ID of the secret store to use to store the registry credentials.",
			demandOption: false,
			conflicts: "disableSecretsStore",
		},
		"secret-name": {
			type: "string",
			description:
				"The name for the secret the private registry credentials should be stored under.",
			demandOption: false,
			conflicts: "disableSecretsStore",
		},
		disableSecretsStore: {
			type: "boolean",
			description:
				"Whether to disable secrets store integration. This should be set iff the compliance region is FedRAMP High.",
			demandOption: false,
			conflicts: ["secret-store-id", "secret-name"],
		},
	},
	positionalArgs: ["DOMAIN"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await registryConfigureCommand(args, config);
	},
});

export const containersRegistriesListCommand = createCommand({
	metadata: {
		description: "List all configured container registries",
		status: "open beta",
		owner: "Product: Cloudchamber",
		hidden: true,
	},
	behaviour: {
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: {
		json: {
			type: "boolean",
			description: "Format output as JSON",
			default: false,
		},
	},
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await registryListCommand(args);
	},
});

export const containersRegistriesDeleteCommand = createCommand({
	metadata: {
		description: "Delete a configured container registry",
		status: "open beta",
		owner: "Product: Cloudchamber",
		hidden: true,
	},
	args: {
		DOMAIN: {
			describe: "Domain of the registry to delete",
			type: "string",
			demandOption: true,
		},
		"skip-confirmation": {
			type: "boolean",
			description: "Skip confirmation prompt",
			alias: "y",
			default: false,
		},
	},
	positionalArgs: ["DOMAIN"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await registryDeleteCommand(args);
	},
});
