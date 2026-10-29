import { configFileName, UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { parseBulkInputToObject } from "../../secret";
import { requireAuth } from "../../user";
import { getLegacyScriptName } from "../../utils/getLegacyScriptName";
import { patchLatestWorkerVersionWithSecrets } from "./index";

export const versionsSecretBulkCommand = createCommand({
	metadata: {
		description:
			"Create, update, or delete multiple secret variables for a Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		supportTemporary: true,
		printConfigWarnings: false,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
	},
	args: {
		file: {
			describe: `The file of key-value pairs to create, update, or delete, as JSON in form {"key": "value", ...} or .env file in the form KEY=VALUE. Set a key to null in the JSON file to delete it. Deletion is not supported with .env files. If omitted, Wrangler expects to receive input from stdin rather than a file.`,
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
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``,
				{ telemetryMessage: "versions secrets bulk missing worker name" }
			);
		}

		const accountId = await requireAuth(config);

		logger.log(
			`🌀 Processing the secrets for the Worker "${scriptName}" ${args.env ? `(${args.env})` : ""}`
		);

		const result = await parseBulkInputToObject(args.file, true);

		if (!result) {
			return logger.error(`No content found in file or piped input.`);
		}

		const { content: secrets, secretSource, secretFormat } = result;

		const secretEntries = Object.entries(secrets);

		const newVersion = await patchLatestWorkerVersionWithSecrets({
			config,
			accountId,
			scriptName,
			secrets,
			versionMessage:
				args.message ?? `Bulk updated ${secretEntries.length} secrets`,
			versionTag: args.tag,
			sendMetrics: config.send_metrics,
			noVersionsTelemetryMessage: "versions secrets bulk no uploaded versions",
		});

		let created = 0;
		let deleted = 0;
		for (const [name, value] of secretEntries) {
			if (value === null) {
				deleted++;
				logger.log(`💥 Successfully deleted secret for key: ${name}`);
			} else {
				created++;
				logger.log(`✨ Successfully created secret for key: ${name}`);
			}
		}

		metrics.sendMetricsEvent(
			"create encrypted variable",
			{
				secretOperation: "bulk",
				secretSource,
				secretFormat,
				hasEnvironment: Boolean(args.env),
			},
			{
				sendMetrics: config.send_metrics,
			}
		);

		logger.log(
			`✨ Success! Created version ${newVersion.id} with ${created} secret${created === 1 ? "" : "s"} created and ${deleted} secret${deleted === 1 ? "" : "s"} deleted.` +
				`\n➡️  To deploy this version to production traffic use the command "wrangler versions deploy".`
		);
	},
});
