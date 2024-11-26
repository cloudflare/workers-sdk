import { fetchResult } from "../../cfetch";
import { configFileName, readConfig } from "../../config";
import { prompt } from "../../dialogs";
import { UserError } from "../../errors";
import { getLegacyScriptName } from "../../index";
import { logger } from "../../logger";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import { readFromStdin, trimTrailingWhitespace } from "../../utils/std";
import { copyWorkerVersionWithNewSecrets } from "./index";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { WorkerVersion } from "./index";

export function versionsSecretsPutOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("key", {
			describe: "The variable name to be accessible in the Worker",
			type: "string",
		})
		.option("name", {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		})
		.option("message", {
			describe: "Description of this deployment",
			type: "string",
			requiresArg: true,
		})
		.option("tag", {
			describe: "A tag for this version",
			type: "string",
			requiresArg: true,
		});
}

export async function versionsSecretPutHandler(
	args: StrictYargsOptionsToInterface<typeof versionsSecretsPutOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args, false, true);

	const scriptName = getLegacyScriptName(args, config);
	if (!scriptName) {
		throw new UserError(
			`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
		);
	}

	if (args.key === undefined) {
		throw new UserError(
			"Secret name is required. Please specify the name of your secret."
		);
	}

	const accountId = await requireAuth(config);

	const isInteractive = process.stdin.isTTY;
	const secretValue = trimTrailingWhitespace(
		isInteractive
			? await prompt("Enter a secret value:", { isSecret: true })
			: await readFromStdin()
	);

	logger.log(
		`🌀 Creating the secret for the Worker "${scriptName}" ${args.env ? `(${args.env})` : ""}`
	);

	// Grab the latest version
	const versions = (
		await fetchResult<{ items: WorkerVersion[] }>(
			`/accounts/${accountId}/workers/scripts/${scriptName}/versions`
		)
	).items;
	if (versions.length === 0) {
		throw new UserError(
			"There are currently no uploaded versions of this Worker. Please upload a version before uploading a secret."
		);
	}
	const latestVersion = versions[0];

	const newVersion = await copyWorkerVersionWithNewSecrets({
		accountId,
		scriptName,
		versionId: latestVersion.id,
		secrets: [{ name: args.key, value: secretValue }],
		versionMessage: args.message ?? `Updated secret "${args.key}"`,
		versionTag: args.tag,
		sendMetrics: config.send_metrics,
	});

	logger.log(
		`✨ Success! Created version ${newVersion.id} with secret ${args.key}.` +
			`\n➡️  To deploy this version with secret ${args.key} to production traffic use the command "wrangler versions deploy".`
	);
}
