import {
	drawBox,
	getBindingValue,
	getPreviewBaseConfig,
	padToVisibleWidth,
	resolveWorkerName,
	visibleLength,
} from "@cloudflare/deploy-helpers";
import { getBindingTypeFriendlyName } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { rejectUnsupportedPreviewArgs } from ".";
import type { Binding, EnvBindings } from "@cloudflare/deploy-helpers";

type SecretSummary = {
	name: string;
	type: "secret_text";
};

function isSecretBinding(binding: Binding): binding is Binding & {
	type: "secret_text";
	text?: string;
} {
	return binding.type === "secret_text";
}

function extractSecretSummaries(env: EnvBindings | undefined): SecretSummary[] {
	return Object.entries(env ?? {})
		.filter(([, binding]) => binding !== null && isSecretBinding(binding))
		.map(([name]) => ({ name, type: "secret_text" }));
}

function formatBaseConfigSecrets(
	workerName: string,
	env: EnvBindings | undefined
): string {
	const secrets = Object.entries(env ?? {}).filter(
		([, binding]) => binding !== null && isSecretBinding(binding)
	);
	const lines: string[] = [];
	lines.push(`${chalk.bold.hex("#FFA500")("Worker:")} ${workerName}`);
	lines.push("");
	lines.push(`  ${chalk.bold.underline("Preview base config")}`);
	lines.push("");
	lines.push(chalk.bold("  Secrets"));

	if (secrets.length === 0) {
		lines.push(`  ${chalk.dim("(none)")}`);
		lines.push("");
		return drawBox(lines);
	}

	const typeLabel = getBindingTypeFriendlyName("secret_text");
	const nameWidth = Math.max(...secrets.map(([name]) => name.length));
	const typeWidth = visibleLength(typeLabel);
	const valueWidth = Math.max(
		...secrets.map(([, binding]) => getBindingValue(binding).length)
	);

	for (const [name, binding] of secrets) {
		lines.push(
			`  ${chalk.cyan(padToVisibleWidth(name, nameWidth))}   ${chalk.dim(padToVisibleWidth(typeLabel, typeWidth))}   ${padToVisibleWidth(getBindingValue(binding), valueWidth)}`
		);
	}

	lines.push("");
	return drawBox(lines);
}

export const previewBaseConfigSecretListCommand = createCommand({
	metadata: {
		description: "List all secrets on the Preview base config",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
	},
	behaviour: {
		printBanner: (args) => args.json !== true,
		suggestSkillsAfterHandler: (args) => args.json !== true,
	},
	validateArgs: rejectUnsupportedPreviewArgs,
	handler: async function previewBaseConfigSecretListHandler(args, { config }) {
		const workerName = resolveWorkerName(args, config);
		const accountId = await requireAuth(config);

		const baseConfig = await getPreviewBaseConfig(
			config,
			accountId,
			workerName
		);
		const secrets = extractSecretSummaries(baseConfig.env);

		if (args.json) {
			logger.log(JSON.stringify(secrets, null, 2));
			return;
		}

		logger.log(formatBaseConfigSecrets(workerName, baseConfig.env));
	},
});
