import {
	endSection,
	newline,
	startSection,
	updateStatus,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { brandColor, dim } from "@cloudflare/cli/colors";
import {
	ApiError,
	ImageRegistriesService,
	ImageRegistryAlreadyExistsError,
	ImageRegistryNotAllowedError,
} from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../../core/create-command";
import { isNonInteractiveOrCI } from "../../is-interactive";
import { logger } from "../../logger";
import { pollRegistriesUntilCondition } from "../cli";
import {
	checkEverythingIsSet,
	cloudchamberScope,
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../common";
import { wrap } from "../helpers/wrap";
import type {
	CommonYargsArgv,
	CommonYargsArgvSanitized,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { ImageRegistryPermissions } from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

function _configureImageRegistryOptionalYargs(yargs: CommonYargsArgv) {
	return yargs
		.option("domain", {
			description:
				"Domain of your registry. Don't include the proto part of the URL, like 'http://'",
			type: "string",
		})
		.option("public", {
			description:
				"If the registry is public and you don't want credentials configured, set this to true",
			type: "boolean",
		});
}

async function registriesConfigureHandler(
	imageArgs: StrictYargsOptionsToInterface<
		typeof _configureImageRegistryOptionalYargs
	>,
	config: Config
) {
	// check we are in CI or if the user wants to just use JSON
	if (isNonInteractiveOrCI()) {
		const body = checkEverythingIsSet(imageArgs, ["domain", "public"]);
		const registry = await ImageRegistriesService.createImageRegistry({
			domain: body.domain,
			is_public: body.public,
		});
		logger.log(JSON.stringify(registry, null, 4));
		return;
	}

	await handleConfigureImageRegistryCommand(imageArgs, config);
}

async function registriesCredentialsHandler(imageArgs: {
	domain: string;
	expirationMinutes: number;
	push?: boolean;
	pull?: boolean;
}) {
	if (!imageArgs.pull && !imageArgs.push) {
		throw new UserError(
			"You have to specify either --push or --pull in the command."
		);
	}

	const credentials =
		await ImageRegistriesService.generateImageRegistryCredentials(
			imageArgs.domain,
			{
				expiration_minutes: imageArgs.expirationMinutes,
				permissions: [
					...(imageArgs.push ? ["push"] : []),
					...(imageArgs.pull ? ["pull"] : []),
				] as ImageRegistryPermissions[],
			}
		);
	logger.log(credentials.password);
}

async function registriesRemoveHandler(
	imageArgs: StrictYargsOptionsToInterface<typeof _removeImageRegistryYargs>
) {
	const registry = await ImageRegistriesService.deleteImageRegistry(
		imageArgs.domain
	);
	logger.log(JSON.stringify(registry, null, 4));
}

async function registriesListHandler(
	_args: CommonYargsArgvSanitized,
	config: Config
) {
	if (isNonInteractiveOrCI()) {
		const registries = await ImageRegistriesService.listImageRegistries();
		logger.log(JSON.stringify(registries, null, 4));
		return;
	}
	await handleListImageRegistriesCommand(_args, config);
}

function _removeImageRegistryYargs(yargs: CommonYargsArgv) {
	return yargs.positional("domain", {
		type: "string",
		demandOption: true,
	});
}

async function handleListImageRegistriesCommand(
	_args: unknown,
	_config: Config
) {
	startSection("Registries", "", false);
	const [registries, err] = await wrap(
		promiseSpinner(pollRegistriesUntilCondition(() => true))
	);

	if (err) {
		throw err;
	}

	if (registries.length === 0) {
		endSection(
			"No registries added to your account!",
			"You can add one with\n" +
				brandColor("wrangler cloudchamber registry configure")
		);
		return;
	}

	for (const registry of registries) {
		newline();
		updateStatus(
			`${registry.domain}\npublic_key: ${dim(
				(registry.public_key ?? "").trim()
			)}`,
			false
		);
	}

	endSection("");
}

async function handleConfigureImageRegistryCommand(
	args: StrictYargsOptionsToInterface<
		typeof _configureImageRegistryOptionalYargs
	>,
	_config: Config
) {
	startSection("Configure a Docker registry in Cloudflare");
	const domain = (await processArgument({ domain: args.domain }, "domain", {
		type: "text",
		question: "What is the domain of your registry?",
		validate: (text) => {
			const t = text?.toString();
			if (t?.includes("://")) {
				return "a proto like https:// shouldn't be included";
			}
		},
		label: "domain",
		defaultValue: "",
		helpText:
			"example.com, example-with-port:8080. Remember to not include https!",
	})) as string;
	const isPublic = (await processArgument({ public: args.public }, "public", {
		type: "confirm",
		question: "Is the domain public?",
		label: "is public",
		helpText:
			"if the domain is not owned by you or you want it to be public, mark as yes",
	})) as boolean;
	const [registry, err] = await wrap(
		promiseSpinner(
			ImageRegistriesService.createImageRegistry({
				domain: domain,
				is_public: isPublic,
			})
		)
	);
	if (err instanceof ApiError) {
		const { error: errString } = err.body as { error: string };
		switch (errString) {
			case ImageRegistryAlreadyExistsError.error.IMAGE_REGISTRY_ALREADY_EXISTS:
				throw new UserError("The domain already exists!");
			case ImageRegistryNotAllowedError.error.IMAGE_REGISTRY_NOT_ALLOWED:
				throw new UserError("This domain is not allowed!");
			default:
				throw new UserError(
					"An unexpected error happened, please try again or send us the error for troubleshooting\n" +
						errString
				);
		}
	}

	if (err) {
		throw new UserError(
			"There has been an internal error: " + JSON.stringify(err)
		);
	}

	endSection(
		`Docker registry configured`,
		registry?.public_key &&
			"set the following public key in the registry if necessary:\n" +
				registry?.public_key
	);
}

export const cloudchamberRegistriesNamespace = createNamespace({
	metadata: {
		description: "Configure registries via Cloudchamber",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
});

export const cloudchamberRegistriesConfigureCommand = createCommand({
	metadata: {
		description: "Configure Cloudchamber to pull from specific registries",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {
		domain: {
			description:
				"Domain of your registry. Don't include the proto part of the URL, like 'http://'",
			type: "string",
		},
		public: {
			description:
				"If the registry is public and you don't want credentials configured, set this to true",
			type: "boolean",
		},
	},
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, cloudchamberScope);
		await registriesConfigureHandler(args, config);
	},
});

export const cloudchamberRegistriesCredentialsCommand = createCommand({
	metadata: {
		description: "Get a temporary password for a specific domain",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {
		domain: {
			type: "string",
			demandOption: true,
		},
		"expiration-minutes": {
			type: "number",
			default: 15,
		},
		push: {
			type: "boolean",
			description: "If you want these credentials to be able to push",
		},
		pull: {
			type: "boolean",
			description: "If you want these credentials to be able to pull",
		},
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, cloudchamberScope);
		await registriesCredentialsHandler(args);
	},
});

export const cloudchamberRegistriesRemoveCommand = createCommand({
	metadata: {
		description: "Remove the registry at the given domain",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {
		domain: {
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, cloudchamberScope);
		await registriesRemoveHandler(args);
	},
});

export const cloudchamberRegistriesListCommand = createCommand({
	metadata: {
		description: "List registries configured for this account",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {},
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, cloudchamberScope);
		await registriesListHandler(args, config);
	},
});
