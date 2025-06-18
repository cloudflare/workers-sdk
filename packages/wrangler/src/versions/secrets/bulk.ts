import { fetchResult } from "../../cfetch";
import { configFileName } from "../../config";
import { createCommand } from "../../core/create-command";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { parseBulkInputToObject } from "../../secret";
import { requireAuth } from "../../user";
import { getLegacyScriptName } from "../../utils/getLegacyScriptName";
import { copyWorkerVersionWithNewSecrets } from "./index";
import type { WorkerVersion } from "./index";

export const versionsSecretBulkCommand = createCommand({
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
		file: {
			describe: `The file of key-value pairs to upload, as JSON in form {"key": value, ...} or .dev.vars file in the form KEY=VALUE`,
			type: "string",
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
	positionalArgs: ["file"],
	handler: async function versionsSecretPutBulkHandler(args, { config }) {
		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
			);
		}

		const accountId = await requireAuth(config);

		logger.log(
			`🌀 Creating the secrets for the Worker "${scriptName}" ${args.env ? `(${args.env})` : ""}`
		);

		const content = await parseBulkInputToObject(args.file);

		if (!content) {
			return logger.error(`No content found in file or piped input.`);
		}

		const secrets = Object.entries(content).map(([key, value]) => ({
			name: key,
			value,
		}));

		// Grab the latest version
		const versions = (
			await fetchResult<{ items: WorkerVersion[] }>(
				config,
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
			config,
			accountId,
			scriptName,
			versionId: latestVersion.id,
			secrets,
			versionMessage: args.message ?? `Bulk updated ${secrets.length} secrets`,
			versionTag: args.tag,
			sendMetrics: config.send_metrics,
			unsafeMetadata: config.unsafe.metadata,
		});

		for (const secret of secrets) {
			logger.log(`✨ Successfully created secret for key: ${secret.name}`);
		}
		logger.log(
			`✨ Success! Created version ${newVersion.id} with ${secrets.length} secrets.` +
				`\n➡️  To deploy this version to production traffic use the command "wrangler versions deploy".`
		);
	},
});
