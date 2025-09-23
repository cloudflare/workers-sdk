import { endSection, log, startSection } from "@cloudflare/cli";
import {
	ApiError,
	getAndValidateRegistryType,
	ImageRegistriesService,
} from "@cloudflare/containers-shared";
import { ExternalRegistryKind } from "@cloudflare/containers-shared/src/client/models/ExternalRegistryKind";
import { promiseSpinner } from "../cloudchamber/common";
import { prompt } from "../dialogs";
import { FatalError, UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { parseJSON } from "../parse";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function registryYargs(args: CommonYargsArgv) {
	return args.positional("DOMAIN", {
		describe: "domain to configure for the registry",
		type: "string",
		demandOption: true,
	});
}

export async function registryCommand(
	configureArgs: StrictYargsOptionsToInterface<typeof registryYargs>,
	_config: Config
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
			throw new FatalError(e.body.error ?? "Unknown API error");
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
