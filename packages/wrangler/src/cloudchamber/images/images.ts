import {
	crash,
	endSection,
	newline,
	startSection,
	updateStatus,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { pollRegistriesUntilCondition } from "../cli";
import {
	ApiError,
	ImageRegistriesService,
	ImageRegistryAlreadyExistsError,
	ImageRegistryNotAllowedError,
} from "../client";
import {
	checkEverythingIsSet,
	handleFailure,
	interactWithUser,
	promiseSpinner,
} from "../common";
import { wrap } from "../helpers/wrap";
import type { Config } from "../../../../wrangler-shared/src/config";
import type {
	CommonYargsArgvJSON,
	CommonYargsArgvSanitizedJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../../yargs-types";
import type { ImageRegistryPermissions } from "../client";

function configureImageRegistryOptionalYargs(yargs: CommonYargsArgvJSON) {
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

function credentialsImageRegistryYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.positional("domain", { type: "string", demandOption: true })
		.option("expiration-minutes", {
			type: "number",
			default: 15,
		})
		.option("push", {
			type: "boolean",
			description: "If you want these credentials to be able to push",
		})
		.option("pull", {
			type: "boolean",
			description: "If you want these credentials to be able to pull",
		});
}

export const registriesCommand = (yargs: CommonYargsArgvJSON) => {
	return yargs
		.command(
			"configure",
			"Configure Cloudchamber to pull from specific registries",
			(args) => configureImageRegistryOptionalYargs(args),
			(args) =>
				handleFailure(
					async (
						imageArgs: StrictYargsOptionsToInterfaceJSON<
							typeof configureImageRegistryOptionalYargs
						>,
						config
					) => {
						// check we are in CI or if the user wants to just use JSON
						if (!interactWithUser(args)) {
							const body = checkEverythingIsSet(imageArgs, [
								"domain",
								"public",
							]);
							const registry = await ImageRegistriesService.createImageRegistry(
								{
									domain: body.domain,
									is_public: body.public,
								}
							);
							console.log(JSON.stringify(registry, null, 4));
							return;
						}

						await handleConfigureImageRegistryCommand(args, config);
					}
				)(args)
		)
		.command(
			"credentials [domain]",
			"get a temporary password for a specific domain",
			(args) =>
				args
					.positional("domain", {
						type: "string",
						demandOption: true,
					})
					.option("expiration-minutes", {
						type: "number",
						default: 15,
					})
					.option("push", {
						type: "boolean",
						description: "If you want these credentials to be able to push",
					})
					.option("pull", {
						type: "boolean",
						description: "If you want these credentials to be able to pull",
					}),
			(args) => {
				// we don't want any kind of spinners
				args.json = true;
				return handleFailure(
					async (
						imageArgs: StrictYargsOptionsToInterfaceJSON<
							typeof credentialsImageRegistryYargs
						>,
						_config
					) => {
						if (!imageArgs.pull && !imageArgs.push) {
							crash(
								"You have to specify either --push or --pull in the command."
							);

							process.exit(1);
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
						console.log(credentials.password);
					}
				)(args);
			}
		)
		.command(
			"remove [domain]",
			"removes the registry at the given domain",
			(args) => removeImageRegistryYargs(args),
			(args) => {
				args.json = true;
				return handleFailure(
					async (
						imageArgs: StrictYargsOptionsToInterfaceJSON<
							typeof removeImageRegistryYargs
						>,
						_config
					) => {
						const registry = await ImageRegistriesService.deleteImageRegistry(
							imageArgs.domain
						);
						console.log(JSON.stringify(registry, null, 4));
					}
				)(args);
			}
		)
		.command(
			"list",
			"list registries configured for this account",
			(args) => args,
			(args) =>
				handleFailure(
					async (imageArgs: CommonYargsArgvSanitizedJSON, config) => {
						if (!interactWithUser(imageArgs)) {
							const registries =
								await ImageRegistriesService.listImageRegistries();
							console.log(JSON.stringify(registries, null, 4));
							return;
						}
						await handleListImageRegistriesCommand(args, config);
					}
				)(args)
		);
};

function removeImageRegistryYargs(yargs: CommonYargsArgvJSON) {
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
	args: StrictYargsOptionsToInterfaceJSON<
		typeof configureImageRegistryOptionalYargs
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
				crash("The domain already exists!");
				break;
			case ImageRegistryNotAllowedError.error.IMAGE_REGISTRY_NOT_ALLOWED:
				crash("This domain is not allowed!");
				break;
			default:
				crash(
					"An unexpected error happened, please try again or send us the error for troubleshooting\n" +
						errString
				);
		}

		return;
	}

	if (err) {
		crash("There has been an internal error:", `${JSON.stringify(err)}`);
		return;
	}

	endSection(
		`Docker registry configured`,
		registry?.public_key &&
			"set the following public key in the registry if necessary:\n" +
				registry?.public_key
	);
}
