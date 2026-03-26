import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import { parseBulkInputToObject } from "../secret";
import { requireAuth } from "../user";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import { editWorkerPreviewDefaults, getWorkerPreviewDefaults } from "./api";
import { resolveWorkerName } from "./shared";
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

function upsertSecretBinding(
	env: EnvBindings,
	key: string,
	value: string
): EnvBindings {
	return {
		...env,
		[key]: { type: "secret_text", text: value },
	};
}

function removeSecretBinding(env: EnvBindings, key: string): EnvBindings {
	const { [key]: _removed, ...rest } = env;
	return rest;
}

function upsertManySecretBindings(
	env: EnvBindings,
	secrets: Record<string, string>
): EnvBindings {
	const updatedEnv = { ...env };
	for (const [name, text] of Object.entries(secrets)) {
		updatedEnv[name] = { type: "secret_text", text };
	}
	return updatedEnv;
}

function extractSecretSummaries(env: EnvBindings | undefined): SecretSummary[] {
	return Object.entries(env ?? {})
		.filter(([, binding]) => isSecretBinding(binding))
		.map(([name]) => ({ name, type: "secret_text" }));
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

	const previewDefaults = await getWorkerPreviewDefaults(
		config,
		accountId,
		workerName
	);
	const updatedBindings = upsertSecretBinding(
		previewDefaults.env ?? {},
		args.key,
		secretValue
	);
	await editWorkerPreviewDefaults(config, accountId, workerName, {
		...previewDefaults,
		env: updatedBindings,
	});
	logger.log(
		`\n✨ Secret "${args.key}" added to Previews settings for "${workerName}".`
	);
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
			`Are you sure you want to delete the secret "${args.key}" from Previews settings for Worker "${workerName}"?`
		);
		if (!confirmed) {
			logger.log("Aborted.");
			return;
		}
	}

	const previewDefaults = await getWorkerPreviewDefaults(
		config,
		accountId,
		workerName
	);
	const updatedBindings = removeSecretBinding(
		previewDefaults.env ?? {},
		args.key
	);
	await editWorkerPreviewDefaults(config, accountId, workerName, {
		...previewDefaults,
		env: updatedBindings,
	});
	logger.log(`\n✨ Secret "${args.key}" deleted from Previews settings.`);
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

	logger.log("Previews settings Secrets:");
	logger.log("─────────────────────────────────────────────────────");
	for (const secret of secrets) {
		logger.log(`  - ${secret.name}`);
	}
	logger.log("─────────────────────────────────────────────────────");
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

	const previewDefaults = await getWorkerPreviewDefaults(
		config,
		accountId,
		workerName
	);
	const updatedBindings = upsertManySecretBindings(
		previewDefaults.env ?? {},
		content
	);
	await editWorkerPreviewDefaults(config, accountId, workerName, {
		...previewDefaults,
		env: updatedBindings,
	});
	logger.log(
		`\n✨ Uploaded ${secretCount} secrets from ${source} to Previews settings for "${workerName}".`
	);
}
