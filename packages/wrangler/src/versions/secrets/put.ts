import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { prompt } from "../../dialogs";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { getLegacyScriptName } from "../../utils/getLegacyScriptName";
import { readFromStdin, trimTrailingWhitespace } from "../../utils/std";
import { copyWorkerVersionWithNewSecrets } from "./index";
import type { WorkerVersion } from "./index";

export const versionsSecretPutCommand = createCommand({
	metadata: {
		description: "Create or update a secret variable for a Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printConfigWarnings: false,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	args: {
		key: {
			describe: "The variable name to be accessible in the Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe: "Description of this deployment",
			type: "string",
			requiresArg: true,
		},
		tag: {
			describe: "A tag for this version",
			type: "string",
			requiresArg: true,
		},
	},
	positionalArgs: ["key"],
	handler: async function versionsSecretPutHandler(args, { config }) {
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
				config,
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
			config,
			accountId,
			scriptName,
			versionId: latestVersion.id,
			secrets: [{ name: args.key, value: secretValue }],
			versionMessage: args.message ?? `Updated secret "${args.key}"`,
			versionTag: args.tag,
			sendMetrics: config.send_metrics,
			unsafeMetadata: config.unsafe.metadata,
		});

		metrics.sendMetricsEvent(
			"create encrypted variable",
			{
				secretOperation: "single",
				secretSource: isInteractive ? "interactive" : "stdin",
				hasEnvironment: Boolean(args.env),
			},
			{
				sendMetrics: config.send_metrics,
			}
		);

		logger.log(
			`✨ Success! Created version ${newVersion.id} with secret ${args.key}.` +
				`\n➡️  To deploy this version with secret ${args.key} to production traffic use the command "wrangler versions deploy".`
		);
	},
});
