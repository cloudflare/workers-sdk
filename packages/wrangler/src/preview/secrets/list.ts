import {
	drawBox,
	getBindingValue,
	getPreviewDeployment,
	padToVisibleWidth,
	resolveWorkerName,
	visibleLength,
} from "@cloudflare/deploy-helpers";
import {
	APIError,
	getBindingTypeFriendlyName,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import {
	NO_PREVIEW_DEPLOYMENT_GET_ERR_CODE,
	noPreviewDeploymentListMessage,
	PREVIEW_NOT_FOUND_ERR_CODE,
	previewNotFoundMessage,
	resolvePreviewName,
} from "./index";
import type { Binding, EnvBindings } from "@cloudflare/deploy-helpers";

type SecretSummary = {
	name: string;
	type: "secret_text";
};

function isSecretBinding(binding: Binding): binding is Binding & {
	type: "secret_text";
	text: string;
} {
	return binding.type === "secret_text";
}

function extractSecretSummaries(env: EnvBindings | undefined): SecretSummary[] {
	return Object.entries(env ?? {})
		.filter(([, binding]) => binding !== null && isSecretBinding(binding))
		.map(([name]) => ({ name, type: "secret_text" }));
}

function formatPreviewSecrets(
	workerName: string,
	previewName: string,
	env: EnvBindings | undefined
): string {
	const secrets = Object.entries(env ?? {}).filter(
		([, binding]) => binding !== null && isSecretBinding(binding)
	);
	const lines: string[] = [];
	lines.push(`${chalk.bold.hex("#FFA500")("Worker:")} ${workerName}`);
	lines.push(`${chalk.bold.hex("#FFA500")("Preview:")} ${previewName}`);
	lines.push("");
	lines.push(`  ${chalk.bold.underline("Latest Preview deployment")}`);
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

export const previewSecretListCommand = createCommand({
	metadata: {
		description: "List all secrets on a Worker Preview's latest deployment",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		name: {
			describe: "Name of the Preview (defaults to current git branch)",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		printBanner: (args) => args.json !== true,
		suggestSkillsAfterHandler: (args) => args.json !== true,
	},
	handler: async function previewSecretListHandler(args, { config }) {
		const workerName = resolveWorkerName(args, config);
		const previewName = resolvePreviewName(args);
		const accountId = await requireAuth(config);

		let deployment;
		try {
			deployment = await getPreviewDeployment(
				config,
				accountId,
				workerName,
				previewName
			);
		} catch (e) {
			if (e instanceof APIError) {
				if (e.code === NO_PREVIEW_DEPLOYMENT_GET_ERR_CODE) {
					throw new UserError(noPreviewDeploymentListMessage(previewName), {
						telemetryMessage: "preview secret list no preview deployment",
					});
				}
				if (e.code === PREVIEW_NOT_FOUND_ERR_CODE) {
					throw new UserError(previewNotFoundMessage(previewName), {
						telemetryMessage: "preview secret list preview not found",
					});
				}
			}
			throw e;
		}
		const secrets = extractSecretSummaries(deployment.env);

		if (args.json) {
			logger.log(JSON.stringify(secrets, null, 2));
			return;
		}

		logger.log(formatPreviewSecrets(workerName, previewName, deployment.env));
	},
});
