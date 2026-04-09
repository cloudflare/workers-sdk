import { getBindingTypeFriendlyName } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import { parseBulkInputToObject } from "../secret";
import { requireAuth } from "../user";
import { drawBox, padToVisibleWidth, visibleLength } from "../utils/box";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import { editWorkerPreviewDefaults, getWorkerPreviewDefaults } from "./api";
import { getBindingValue, resolveWorkerName } from "./shared";
import type { Binding, EnvBindings } from "./api";
import type { Config } from "@cloudflare/workers-utils";

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

function toSecretBindingsPatch(secrets: Record<string, string>): EnvBindings {
	return Object.fromEntries(
		Object.entries(secrets).map(([name, text]) => [
			name,
			{ type: "secret_text", text },
		])
	);
}

function extractSecretSummaries(env: EnvBindings | undefined): SecretSummary[] {
	return Object.entries(env ?? {})
		.filter(([, binding]) => binding !== null && isSecretBinding(binding))
		.map(([name]) => ({ name, type: "secret_text" }));
}

function formatPreviewSecrets(
	workerName: string,
	env: EnvBindings | undefined
): string {
	const secrets = Object.entries(env ?? {}).filter(
		([, binding]) => binding !== null && isSecretBinding(binding)
	);
	const lines: string[] = [];
	lines.push(`${chalk.bold.hex("#FFA500")("Worker:")} ${workerName}`);
	lines.push("");
	lines.push(`  ${chalk.bold.underline("Previews settings")}`);
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

export async function handlePreviewSecretPutCommand(
	args: {
		key: string;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const accountId = await requireAuth(config);
	const secretValue = trimTrailingWhitespace(
		process.stdin.isTTY
			? await prompt("Enter a secret value:", { isSecret: true })
			: await readFromStdin()
	);

	const updatedPreviewDefaults = await editWorkerPreviewDefaults(
		config,
		accountId,
		workerName,
		{
			env: toSecretBindingsPatch({ [args.key]: secretValue }),
		}
	);
	logger.log(
		`\n✨ Secret "${args.key}" added to Previews settings for Worker ${chalk.bold.cyan(workerName)}.`
	);
	logger.log(formatPreviewSecrets(workerName, updatedPreviewDefaults.env));
}

export async function handlePreviewSecretDeleteCommand(
	args: {
		key: string;
		skipConfirmation?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const accountId = await requireAuth(config);

	if (!args.skipConfirmation) {
		const confirmed = await confirm(
			`Are you sure you want to delete the secret "${args.key}" from Previews settings for Worker ${chalk.bold.cyan(workerName)}?`
		);
		if (!confirmed) {
			logger.log("Aborted.");
			return;
		}
	}

	const updatedPreviewDefaults = await editWorkerPreviewDefaults(
		config,
		accountId,
		workerName,
		{
			env: {
				[args.key]: null,
			},
		}
	);
	logger.log(
		`\n✨ Secret "${args.key}" deleted from Previews settings for Worker ${chalk.bold.cyan(workerName)}.`
	);
	logger.log(formatPreviewSecrets(workerName, updatedPreviewDefaults.env));
}

export async function handlePreviewSecretListCommand(
	args: {
		json?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const accountId = await requireAuth(config);

	const previewDefaults = await getWorkerPreviewDefaults(
		config,
		accountId,
		workerName
	);
	const secrets = extractSecretSummaries(previewDefaults.env);

	if (args.json) {
		logger.log(JSON.stringify(secrets, null, 2));
		return;
	}

	logger.log(formatPreviewSecrets(workerName, previewDefaults.env));
}

export async function handlePreviewSecretBulkCommand(
	args: {
		file?: string;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const accountId = await requireAuth(config);
	const result = await parseBulkInputToObject(args.file);

	if (!result) {
		logger.error("No content found in file, or piped input.");
		return;
	}

	const { content } = result;
	const secretCount = Object.keys(content).length;
	const source = args.file ? `file "${args.file}"` : "stdin";

	const updatedPreviewDefaults = await editWorkerPreviewDefaults(
		config,
		accountId,
		workerName,
		{
			env: toSecretBindingsPatch(content),
		}
	);
	logger.log(
		`\n✨ Uploaded ${secretCount} secrets from ${source} to Previews settings for Worker ${chalk.bold.cyan(workerName)}.`
	);
	logger.log(formatPreviewSecrets(workerName, updatedPreviewDefaults.env));
}
