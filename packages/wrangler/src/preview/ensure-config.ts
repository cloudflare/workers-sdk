import { readFileSync } from "node:fs";
import {
	getPreviewBaseConfig,
	isWorkerNotFoundError,
	resolveWorkerName,
} from "@cloudflare/deploy-helpers";
import {
	configFormat,
	experimental_patchConfig,
	formatConfigSnippet,
	isNonInteractiveOrCI,
	JSON_CONFIG_FORMATS,
	JsonFriendlyFatalError,
	UserError,
} from "@cloudflare/workers-utils";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import {
	convertPreviewBaseToPreviewsConfig,
	convertProductionToPreviewsConfig,
	REPLACE_ME,
} from "./preview-config";
import type { ProposedPreviewsConfig } from "./preview-config";
import type { PreviewBaseConfig } from "@cloudflare/deploy-helpers";
import type {
	Config,
	PreviewsConfig,
	RawConfig,
} from "@cloudflare/workers-utils";

export type EnsurePreviewsConfigArgs = {
	workerName?: string;
	"worker-name"?: string;
	ignoreBaseConfig?: boolean;
	json?: boolean;
};

function logConversionMessages(
	messages: string[],
	json: boolean | undefined
): void {
	if (!json) {
		for (const message of messages) {
			logger.warn(message);
		}
	}
}

function hasConfiguredFields(value: object | undefined): boolean {
	return value !== undefined && Object.keys(value).length > 0;
}

function containsGeneratedPlaceholder(value: unknown): boolean {
	if (value === REPLACE_ME) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some(containsGeneratedPlaceholder);
	}
	if (typeof value === "object" && value !== null) {
		return Object.entries(value).some(
			([key, child]) =>
				key === REPLACE_ME || containsGeneratedPlaceholder(child)
		);
	}
	return false;
}

function writePreviewsConfig(config: Config, previews: PreviewsConfig): void {
	const configPath = config.userConfigPath;
	if (configPath === undefined) {
		throw new Error("Cannot write Preview configuration without a user config");
	}

	const patch: RawConfig = config.targetEnvironment
		? { env: { [config.targetEnvironment]: { previews } } }
		: { previews };
	experimental_patchConfig(configPath, patch, false);
}

/** Resolves Preview onboarding configuration before build and deployment. */
export async function ensurePreviewsConfig(
	accountId: string,
	args: EnsurePreviewsConfigArgs,
	config: Config
): Promise<Config> {
	if (config.previews !== undefined) {
		if (containsGeneratedPlaceholder(config.previews)) {
			throw new UserError(
				"Your Preview configuration still contains <REPLACE_ME>. Replace it with a Preview-safe value before deploying.",
				{
					telemetryMessage:
						"preview command previews configuration placeholder",
				}
			);
		}
		return config;
	}
	if (
		!args.json &&
		config.targetEnvironment === undefined &&
		config.definedEnvironments !== undefined &&
		config.definedEnvironments.length > 0
	) {
		logger.warn(
			"Wrangler found named environments in your configuration. Pass `--env <environment>` to target a named environment, or omit `--env` to target the top-level Worker.\nSee https://developers.cloudflare.com/workers/previews/compare-workflows/#wrangler-environments for more information."
		);
	}

	const configPath = config.userConfigPath ?? config.configPath;
	const workerName = resolveWorkerName(args, config);
	let baseConfig: PreviewBaseConfig | undefined;
	if (!args.ignoreBaseConfig) {
		try {
			baseConfig = await getPreviewBaseConfig(config, accountId, workerName);
		} catch (error) {
			if (!isWorkerNotFoundError(error)) {
				throw error;
			}
		}
	}
	const productionConversion = convertProductionToPreviewsConfig(config);

	const baseConversion: ProposedPreviewsConfig = baseConfig
		? convertPreviewBaseToPreviewsConfig(baseConfig)
		: { config: {}, messages: [], blockingDeploymentMessages: [] };
	const hasPreviewBase = hasConfiguredFields(baseConfig);
	// preview base configuration takes precedence over local config for warnings, printed output, etc
	const selectedConversion = hasPreviewBase
		? baseConversion
		: productionConversion;
	const proposedConfig = selectedConversion.config;
	const proposedConfigPatch: RawConfig = config.targetEnvironment
		? { env: { [config.targetEnvironment]: { previews: proposedConfig } } }
		: { previews: proposedConfig };
	const formattedProposedConfig = formatConfigSnippet(
		proposedConfigPatch,
		configPath
	);
	const conversionMessages = [
		...new Set([
			...selectedConversion.messages,
			...selectedConversion.blockingDeploymentMessages,
		]),
	];
	if (!hasPreviewBase && containsGeneratedPlaceholder(proposedConfig)) {
		conversionMessages.push(
			"Replace each <REPLACE_ME> placeholder with a Preview-safe value. Do not use production resources unless you intend for this Preview to access them."
		);
	}

	const hasEmptyProposedConfig = Object.keys(proposedConfig).length === 0;
	const hasBlockingDeploymentMessages =
		selectedConversion.blockingDeploymentMessages.length > 0;
	const missingPreviewsConfigParagraphs = [
		hasEmptyProposedConfig && conversionMessages.length === 0
			? "Your Wrangler configuration is missing a `previews` block to run this command. Add the following to your configuration file:"
			: hasEmptyProposedConfig || hasBlockingDeploymentMessages
				? "Your Wrangler configuration needs a `previews` block to run this command. Add the following to your configuration file:"
				: "Your Wrangler configuration is missing a `previews` block. Add the following to your configuration file:",
		formattedProposedConfig,
	];
	if (hasEmptyProposedConfig && conversionMessages.length === 0) {
		missingPreviewsConfigParagraphs.push(
			"To create or update a Preview with `npx wrangler preview`, your Wrangler configuration must include a `previews` block. The block can be empty. Assets, compatibility settings, migrations, and placement stay at the top level and do not need to be added to `previews`.\nLearn more: https://developers.cloudflare.com/workers/previews/configuration/#wrangler-configuration-file"
		);
	}
	const missingPreviewsConfigMessage =
		missingPreviewsConfigParagraphs.join("\n");
	if (args.json) {
		throw new JsonFriendlyFatalError(
			JSON.stringify(
				{
					error: "Your Wrangler configuration is missing a previews block",
					suggested_config: proposedConfigPatch,
					...(conversionMessages.length > 0 && {
						messages: conversionMessages,
					}),
				},
				null,
				2
			),
			{
				telemetryMessage: "preview command previews configuration missing",
			}
		);
	}

	if (hasBlockingDeploymentMessages) {
		logConversionMessages(conversionMessages, args.json);
		throw new UserError(missingPreviewsConfigMessage, {
			telemetryMessage: "preview command previews configuration missing",
		});
	}

	if (!hasPreviewBase) {
		logConversionMessages(conversionMessages, args.json);
		throw new UserError(missingPreviewsConfigMessage, {
			telemetryMessage: "preview command previews configuration missing",
		});
	}

	const format = configFormat(config.userConfigPath);
	const canWriteConfig =
		config.userConfigPath !== undefined &&
		config.userConfigPath === config.configPath &&
		(JSON_CONFIG_FORMATS.includes(format) ||
			(format === "toml" &&
				!readFileSync(config.userConfigPath, "utf8").includes("#")));
	if (!canWriteConfig || args.json || isNonInteractiveOrCI()) {
		logConversionMessages(conversionMessages, args.json);
		throw new UserError(missingPreviewsConfigMessage, {
			telemetryMessage: "preview command previews configuration missing",
		});
	}

	logConversionMessages(conversionMessages, args.json);
	logger.info(
		`Wrangler detected Preview configuration set via the Cloudflare Dashboard:\n${formattedProposedConfig}`
	);
	if (
		!(await confirm(
			"Would you like Wrangler to add this configuration to your local configuration file?"
		))
	) {
		throw new UserError(missingPreviewsConfigMessage, {
			telemetryMessage: "preview command previews configuration missing",
		});
	}

	writePreviewsConfig(config, baseConversion.config);
	return { ...config, previews: baseConversion.config };
}
