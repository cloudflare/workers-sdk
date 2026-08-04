import {
	drawBox,
	editWorkerPreviewDefaults,
	getBindingValue,
	getBranchName,
	getWorkerPreviewDefaults,
	padToVisibleWidth,
	patchPreviewDeployment,
	resolveWorkerName,
	visibleLength,
} from "@cloudflare/deploy-helpers";
import {
	APIError,
	getBindingTypeFriendlyName,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import { parseBulkInputToObject } from "../secret";
import { requireAuth } from "../user";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import type { Binding, EnvBindings } from "@cloudflare/deploy-helpers";
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

function resolvePreviewName(args: { name?: string }): string {
	const previewName = args.name ?? getBranchName();
	if (!previewName) {
		throw new UserError(
			"Could not determine Preview name. No git branch detected. " +
				"Please provide a Preview name using --name <preview-name>.",
			{ telemetryMessage: "preview secret command missing preview name" }
		);
	}
	return previewName;
}

const NO_PREVIEW_DEPLOYMENT_ERR_CODE = 10032;
const PREVIEW_NOT_FOUND_ERR_CODE = 10025;
const noPreviewDeploymentMessage = (previewName: string) =>
	`There are currently no deployments for the Preview "${previewName}". Please create a Preview deployment before modifying a secret.`;
const previewNotFoundMessage = (previewName: string) =>
	`The Preview "${previewName}" was not found. Please check the Preview name, or create it with \`wrangler preview\`.`;

async function patchPreviewDeploymentSecrets(
	config: Config,
	accountId: string,
	workerName: string,
	previewName: string,
	env: Record<string, Binding | null>,
	annotation: { message: string; tag?: string },
	telemetryMessages: { noDeployment: string; previewNotFound: string }
) {
	try {
		return await patchPreviewDeployment(
			config,
			accountId,
			workerName,
			previewName,
			env,
			{
				"workers/message": annotation.message,
				"workers/tag": annotation.tag,
			}
		);
	} catch (e) {
		if (e instanceof APIError) {
			if (e.code === NO_PREVIEW_DEPLOYMENT_ERR_CODE) {
				throw new UserError(noPreviewDeploymentMessage(previewName), {
					telemetryMessage: telemetryMessages.noDeployment,
				});
			}
			if (e.code === PREVIEW_NOT_FOUND_ERR_CODE) {
				throw new UserError(previewNotFoundMessage(previewName), {
					telemetryMessage: telemetryMessages.previewNotFound,
				});
			}
		}
		throw e;
	}
}

export async function handlePreviewSecretPutCommand(
	args: {
		key: string;
		name?: string;
		message?: string;
		tag?: string;
		env?: string;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const previewName = resolvePreviewName(args);
	const accountId = await requireAuth(config);
	const secretValue = trimTrailingWhitespace(
		process.stdin.isTTY
			? await prompt("Enter a secret value:", { isSecret: true })
			: await readFromStdin()
	);

	logger.log(
		`🌀 Creating the secret for the Preview "${previewName}" on the Worker "${workerName}"${args.env ? ` (${args.env})` : ""}`
	);

	const deployment = await patchPreviewDeploymentSecrets(
		config,
		accountId,
		workerName,
		previewName,
		toSecretBindingsPatch({ [args.key]: secretValue }),
		{ message: args.message ?? `Updated secret "${args.key}"`, tag: args.tag },
		{
			noDeployment: "preview secret put no preview deployment",
			previewNotFound: "preview secret put preview not found",
		}
	);

	const liveUrls = deployment.urls ?? [];
	logger.log(
		`✨ Success! Created Preview deployment ${deployment.id} with secret ${args.key}.` +
			(liveUrls.length > 0
				? `\n➡️  Your Preview "${previewName}" is now live at ${liveUrls
						.map((url) => chalk.bold.underline(url))
						.join(", ")}`
				: "")
	);
}

export async function handlePreviewSecretDeleteCommand(
	args: {
		key: string;
		name?: string;
		message?: string;
		tag?: string;
		skipConfirmation?: boolean;
		env?: string;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	const previewName = resolvePreviewName(args);
	const accountId = await requireAuth(config);

	if (
		args.skipConfirmation ||
		(await confirm(
			`Are you sure you want to permanently delete the secret ${args.key} on the Preview "${previewName}" for the Worker ${workerName}${args.env ? ` (${args.env})` : ""}?`
		))
	) {
		logger.log(
			`🌀 Deleting the secret ${args.key} on the Preview "${previewName}" for the Worker ${workerName}${args.env ? ` (${args.env})` : ""}`
		);

		const deployment = await patchPreviewDeploymentSecrets(
			config,
			accountId,
			workerName,
			previewName,
			{ [args.key]: null },
			{ message: args.message ?? `Deleted secret "${args.key}"`, tag: args.tag },
			{
				noDeployment: "preview secret delete no preview deployment",
				previewNotFound: "preview secret delete preview not found",
			}
		);

		const liveUrls = deployment.urls ?? [];
		logger.log(
			`✨ Success! Created Preview deployment ${deployment.id} with deleted secret ${args.key}.` +
				(liveUrls.length > 0
					? `\n➡️  Your Preview "${previewName}" is now live at ${liveUrls
							.map((url) => chalk.bold.underline(url))
							.join(", ")}`
					: "")
		);
	}
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
