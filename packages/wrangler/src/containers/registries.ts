import {
	cancel,
	endSection,
	log,
	startSection,
	updateStatus,
} from "@cloudflare/cli";
import {
	ApiError,
	ExternalRegistryKind,
	getAndValidateRegistryType,
	getCloudflareContainerRegistry,
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
import {
	createSecret,
	createStore,
	deleteSecret,
	getSecretByName,
	listStores,
} from "../secrets-store/client";
import { validateSecretName } from "../secrets-store/commands";
import { getAccountId } from "../user";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import { formatError } from "./deploy";
import { containersScope } from ".";
import type { HandlerArgs, NamedArgDefinitions } from "../core/types";
import type {
	DeleteImageRegistryResponse,
	ImageRegistryAuth,
	ImageRegistryPermissions,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

const registryConfigureArgs = {
	DOMAIN: {
		describe: "Domain to configure for the registry",
		type: "string",
		demandOption: true,
	},
	"public-credential": {
		type: "string",
		demandOption: false,
		hidden: true,
		deprecated: true,
		conflicts: ["dockerhub-username", "aws-access-key-id"],
	},
	"aws-access-key-id": {
		type: "string",
		description: "When configuring Amazon ECR, `AWS_ACCESS_KEY_ID`",
		demandOption: false,
		conflicts: ["public-credential", "dockerhub-username"],
	},
	"dockerhub-username": {
		type: "string",
		description: "When configuring DockerHub, the DockerHub username",
		demandOption: false,
		conflicts: ["public-credential", "aws-access-key-id"],
	},
	"secret-store-id": {
		type: "string",
		description:
			"The ID of the secret store to use to store the registry credentials.",
		demandOption: false,
		conflicts: "disable-secrets-store",
	},
	"secret-name": {
		type: "string",
		description:
			"The name for the secret the private registry credentials should be stored under.",
		demandOption: false,
		conflicts: "disable-secrets-store",
	},
	"disable-secrets-store": {
		type: "boolean",
		description:
			"Whether to disable secrets store integration. This should be set iff the compliance region is FedRAMP High.",
		demandOption: false,
		conflicts: ["secret-store-id", "secret-name"],
	},
	"skip-confirmation": {
		type: "boolean",
		description: "Skip confirmation prompts",
		alias: "y",
		default: false,
	},
} as const satisfies NamedArgDefinitions;

async function registryConfigureCommand(
	configureArgs: HandlerArgs<typeof registryConfigureArgs>,
	config: Config
) {
	startSection("Configure a container registry");

	const registryType = getAndValidateRegistryType(configureArgs.DOMAIN);

	if (registryType.type === "cloudflare") {
		log(
			"You do not need to configure credentials for Cloudflare managed registries.\n"
		);
		endSection("No configuration required");
		return;
	}

	const publicCredential =
		configureArgs.awsAccessKeyId ??
		configureArgs.dockerhubUsername ??
		configureArgs.publicCredential;
	if (!publicCredential) {
		const arg =
			registryType.type === ExternalRegistryKind.DOCKER_HUB
				? "dockerhub-username"
				: registryType.type === ExternalRegistryKind.ECR
					? "aws-access-key-id"
					: "public-credential";
		throw new UserError(`Missing required argument: ${arg}`);
	}

	log(`Configuring ${registryType.name} registry: ${configureArgs.DOMAIN}\n`);

	const isFedRAMPHigh =
		getCloudflareComplianceRegion(config) === "fedramp_high";
	if (isFedRAMPHigh) {
		if (!configureArgs.disableSecretsStore) {
			throw new UserError(
				"Secrets Store is not supported in FedRAMP compliance regions. You must set --disable-secrets-store."
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
	const privateCredential = await promptForRegistryPrivateCredential(
		registryType.secretType
	);

	// Secret Store is not available in FedRAMP High
	let private_credential: ImageRegistryAuth["private_credential"];
	if (!isFedRAMPHigh) {
		log("\nSetting up integration with Secrets Store...\n");
		const accountId = await getAccountId(config);

		if (!secretStoreId) {
			const stores = await listStores(config, accountId);
			if (stores.length === 0) {
				const defaultStoreName = "default_secret_store";
				if (!configureArgs.skipConfirmation) {
					const yes = await confirm(
						`No existing Secret Stores found. Create a Secret Store to store your registry credentials?`
					);

					if (!yes) {
						endSection("Cancelled.");
						return;
					}
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

		secretName = await getOrCreateSecret({
			configureArgs: configureArgs,
			config: config,
			accountId: accountId,
			storeId: secretStoreId,
			privateCredential,
			secretType: registryType.secretType,
		});

		private_credential = {
			store_id: secretStoreId,
			secret_name: secretName,
		};
	} else {
		// If we are not using the secret store, we will be passing in the secret directly
		private_credential = privateCredential;
	}

	try {
		await promiseSpinner(
			ImageRegistriesService.createImageRegistry({
				domain: configureArgs.DOMAIN,
				is_public: false,
				auth: {
					public_credential: publicCredential,
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

async function promptForSecretName(secretType?: string): Promise<string> {
	while (true) {
		try {
			const res = await prompt(`Secret name:`, {
				defaultValue: `${secretType?.replaceAll(" ", "_")}`,
			});

			validateSecretName(res);
			return res;
		} catch (e) {
			log((e as Error).message);
			continue;
		}
	}
}

interface GetOrCreateSecretOptions {
	configureArgs: HandlerArgs<typeof registryConfigureArgs>;
	config: Config;
	accountId: string;
	storeId: string;
	privateCredential: string;
	secretType?: string;
}

async function getOrCreateSecret(
	options: GetOrCreateSecretOptions
): Promise<string> {
	let secretName =
		options.configureArgs.secretName ??
		(await promptForSecretName(options.secretType));

	while (true) {
		const existingSecretId = await getSecretByName(
			options.config,
			options.accountId,
			options.storeId,
			secretName
		);

		// secret doesn't exist - make a new one
		if (!existingSecretId) {
			await promiseSpinner(
				createSecret(options.config, options.accountId, options.storeId, {
					name: secretName,
					value: options.privateCredential,
					scopes: ["containers"],
					comment: `Created by Wrangler: credentials for image registry ${options.configureArgs.DOMAIN}`,
				})
			);

			log(
				`Container-scoped secret "${secretName}" created in Secrets Store.\n`
			);

			return secretName;
		}

		// secret exists + skipConfirmation - default to reusing the secret
		if (options.configureArgs.skipConfirmation) {
			log(
				`Using existing secret "${secretName}" from secret store with id: ${options.storeId}.\n`
			);
			return secretName;
		}

		// secret exists but not skipping confirmation - ask user if they want to reuse the secret
		startSection(
			`The provided secret name "${secretName}" is already in-use within the secret store. (Store ID: ${options.storeId})`
		);

		const reuseExisting = await confirm(
			`Do you want to reuse the existing secret? If not, then you'll be prompted to pick a new name.`
		);

		if (reuseExisting) {
			log(
				`Using existing secret "${secretName}" from secret store with id: ${options.storeId}.\n`
			);
			return secretName;
		}

		secretName = await promptForSecretName(options.secretType);
	}
}

async function promptForRegistryPrivateCredential(
	secretType?: string
): Promise<string> {
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

const registryListArgs = {
	json: {
		type: "boolean",
		description: "Format output as JSON",
		default: false,
	},
} as const satisfies NamedArgDefinitions;

async function registryListCommand(
	listArgs: HandlerArgs<typeof registryListArgs>
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

const registryDeleteArgs = {
	DOMAIN: {
		describe: "Domain of the registry to delete",
		type: "string",
		demandOption: true,
	},
	"skip-confirmation": {
		type: "boolean",
		description: "Skip confirmation prompts for registry and secret deletion",
		alias: "y",
		default: false,
	},
} as const satisfies NamedArgDefinitions;

async function registryDeleteCommand(
	deleteArgs: HandlerArgs<typeof registryDeleteArgs>,
	config: Config
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

	let res: DeleteImageRegistryResponse;

	try {
		res = await promiseSpinner(
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

	if (res.secrets_store_ref) {
		// returned as "store-id:secret-name"
		const [storeId, secretName] = res.secrets_store_ref.split(":");

		startSection("Warning: A dangling secret was left behind.");
		if (!deleteArgs.skipConfirmation) {
			const yes = await confirm(
				`Do you want to delete the secret "${secretName}"? (Store ID: ${storeId})`
			);

			if (!yes) {
				endSection("The secret was not deleted.");
				return;
			}
		}

		const accountId = await getAccountId(config);

		try {
			const secretId = await promiseSpinner(
				getSecretByName(config, accountId, storeId, secretName)
			);

			if (!secretId) {
				endSection(
					`Secret "${secretName}" not found in store. It may have already been deleted.`
				);
				return;
			}

			await promiseSpinner(deleteSecret(config, accountId, storeId, secretId));
		} catch (e) {
			if (e instanceof ApiError) {
				throw new APIError({
					status: e.status,
					text: `Error deleting secret:\n` + formatError(e),
				});
			} else {
				throw e;
			}
		}

		endSection(`Deleted secret ${res.secrets_store_ref}`);
	}
}

async function registryCredentialsCommand(credentialsArgs: {
	DOMAIN?: string;
	expirationMinutes: number;
	push?: boolean;
	pull?: boolean;
	json?: boolean;
}) {
	const cloudflareRegistry = getCloudflareContainerRegistry();
	const domain = credentialsArgs.DOMAIN || cloudflareRegistry;
	if (domain !== cloudflareRegistry) {
		throw new UserError(
			`The credentials command only accepts the Cloudflare managed registry (${cloudflareRegistry}).`
		);
	}

	if (!credentialsArgs.pull && !credentialsArgs.push) {
		throw new UserError(
			"You have to specify either --push or --pull in the command."
		);
	}

	const credentials =
		await ImageRegistriesService.generateImageRegistryCredentials(domain, {
			expiration_minutes: credentialsArgs.expirationMinutes,
			permissions: [
				...(credentialsArgs.push ? ["push"] : []),
				...(credentialsArgs.pull ? ["pull"] : []),
			] as ImageRegistryPermissions[],
		});
	if (credentialsArgs.json) {
		logger.json(credentials);
	} else {
		logger.log(credentials.password);
	}
}

export const containersRegistriesNamespace = createNamespace({
	metadata: {
		description: "Configure and manage non-Cloudflare registries",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
});

export const containersRegistriesConfigureCommand = createCommand({
	metadata: {
		description:
			"Configure credentials for a non-Cloudflare container registry",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
	args: registryConfigureArgs,
	positionalArgs: ["DOMAIN"],
	validateArgs(args) {
		if (
			args.skipConfirmation &&
			!args.secretName &&
			!args.disableSecretsStore
		) {
			throw new UserError(
				"--secret-name is required when using --skip-confirmation"
			);
		}
	},
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
	},
	behaviour: {
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: registryListArgs,
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
	},
	args: registryDeleteArgs,
	positionalArgs: ["DOMAIN"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await registryDeleteCommand(args, config);
	},
});

export const containersRegistriesCredentialsCommand = createCommand({
	metadata: {
		description: "Get a temporary password for a specific domain",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: {
		DOMAIN: {
			type: "string",
			describe: "Domain to get credentials for",
		},
		"expiration-minutes": {
			type: "number",
			default: 15,
			description: "How long the credentials should be valid for (in minutes)",
		},
		push: {
			type: "boolean",
			description: "If you want these credentials to be able to push",
		},
		pull: {
			type: "boolean",
			description: "If you want these credentials to be able to pull",
		},
		json: {
			type: "boolean",
			description: "Format output as JSON",
			default: false,
		},
	},
	positionalArgs: ["DOMAIN"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await registryCredentialsCommand(args);
	},
});
