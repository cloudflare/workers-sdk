import path from "node:path";
import readline from "node:readline";
import { fetchResult } from "../../cfetch";
import { readConfig } from "../../config";
import { UserError } from "../../errors";
import { getLegacyScriptName } from "../../index";
import { logger } from "../../logger";
import { parseJSON, readFileSync } from "../../parse";
import { validateJSONFileSecrets } from "../../secret";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import { copyWorkerVersionWithNewSecrets } from "./index";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { WorkerVersion } from "./index";

export function versionsSecretsPutBulkOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("json", {
			describe: `The JSON file of key-value pairs to upload, in form {"key": value, ...}`,
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

export async function versionsSecretPutBulkHandler(
	args: StrictYargsOptionsToInterface<typeof versionsSecretsPutBulkOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args, false, true);

	const scriptName = getLegacyScriptName(args, config);
	if (!scriptName) {
		throw new UserError(
			"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
		);
	}

	const accountId = await requireAuth(config);

	logger.log(
		`🌀 Creating the secrets for the Worker "${scriptName}" ${args.env ? `(${args.env})` : ""}`
	);

	let content: Record<string, string>;
	if (args.json) {
		const jsonFilePath = path.resolve(args.json);
		try {
			content = parseJSON<Record<string, string>>(
				readFileSync(jsonFilePath),
				jsonFilePath
			);
		} catch (e) {
			return logger.error(
				"Unable to parse JSON file, please ensure the file passed is valid JSON."
			);
		}
		validateJSONFileSecrets(content, args.json);
	} else {
		try {
			const rl = readline.createInterface({ input: process.stdin });
			let pipedInput = "";
			for await (const line of rl) {
				pipedInput += line;
			}
			content = parseJSON<Record<string, string>>(pipedInput);
		} catch {
			return logger.error(
				"Unable to parse JSON from the input, please ensure you're passing valid JSON"
			);
		}
	}

	if (!content) {
		return logger.error(`No content found in JSON file or piped input.`);
	}

	const secrets = Object.entries(content).map(([key, value]) => ({
		name: key,
		value,
	}));

	// Grab the latest version
	const versions = (
		await fetchResult<{ items: WorkerVersion[] }>(
			`/accounts/${accountId}/workers/scripts/${scriptName}/versions`
		)
	).items;
	if (versions.length === 0) {
		throw new UserError(
			"There are currently no uploaded versions of this Worker - please upload a version before uploading a secret."
		);
	}
	const latestVersion = versions[0];

	const newVersion = await copyWorkerVersionWithNewSecrets({
		accountId,
		scriptName,
		versionId: latestVersion.id,
		secrets,
		versionMessage: args.message ?? `Bulk updated ${secrets.length} secrets`,
		versionTag: args.tag,
	});

	for (const secret of secrets) {
		logger.log(`✨ Successfully created secret for key: ${secret.name}`);
	}
	logger.log(
		`✨ Success! Created version ${newVersion.id} with ${secrets.length} secrets.` +
			`\n➡️  To deploy this version to production traffic use the command "wrangler versions deploy".`
	);
}
