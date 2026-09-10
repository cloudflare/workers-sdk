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

const PREVIEW_BASE_BINDINGS_NOT_COPIED_MESSAGE =
	"Wrangler did not copy these Preview Base bindings into local Preview configuration. They remain configured in Preview Base.";
const MANUAL_PREVIEW_CONFIG_MESSAGE =
	"Wrangler cannot safely generate Preview configuration for these production bindings. Configure Preview-safe values manually.";
const ADD_PREVIEW_BASE_CONFIG_PROMPT =
	"Would you like Wrangler to add the Preview Base configuration to your config file?";
const MISSING_PREVIEWS_CONFIG_MESSAGE =
	"Your Wrangler configuration is missing a `previews` block. Add the following to your configuration file:";
const GENERATED_PLACEHOLDER_MESSAGE =
	"Your `previews` configuration contains the generated placeholder `<REPLACE_ME>`. Replace it with a Preview-safe value before deploying.";

function hasConfiguredValues(value: unknown): boolean {
	if (value === undefined) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.some(hasConfiguredValues);
	}
	if (typeof value === "object" && value !== null) {
		return Object.values(value).some(hasConfiguredValues);
	}
	return true;
}

function containsGeneratedPlaceholder(value: unknown): boolean {
	if (value === REPLACE_ME) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some(containsGeneratedPlaceholder);
	}
	if (typeof value === "object" && value !== null) {
		return Object.values(value).some(containsGeneratedPlaceholder);
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
			throw new UserError(GENERATED_PLACEHOLDER_MESSAGE, {
				telemetryMessage: "preview command previews configuration placeholder",
			});
		}
		return config;
	}

	const configPath = config.userConfigPath ?? config.configPath;
	const productionConversion = convertProductionToPreviewsConfig(config);
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

	const baseConversion: ProposedPreviewsConfig = baseConfig
		? convertPreviewBaseToPreviewsConfig(baseConfig)
		: { config: {}, omittedBindings: [] };
	const manualBindings = productionConversion.omittedBindings.filter(
		(productionBinding) =>
			!baseConversion.omittedBindings.some(
				(baseBinding) =>
					baseBinding.name === productionBinding.name &&
					baseBinding.type === productionBinding.type
			)
	);

	if (!args.json && baseConversion.omittedBindings.length > 0) {
		logger.info(
			`${PREVIEW_BASE_BINDINGS_NOT_COPIED_MESSAGE}\n${baseConversion.omittedBindings
				.map(({ name, type }) => `  - ${name} (${type})`)
				.join("\n")}`
		);
	}

	if (manualBindings.length > 0) {
		throw new UserError(
			`${MISSING_PREVIEWS_CONFIG_MESSAGE}\n\n${formatConfigSnippet(
				{ previews: baseConversion.config },
				configPath
			)}\n\n${MANUAL_PREVIEW_CONFIG_MESSAGE}\n${manualBindings
				.map(({ name, type }) => `  - ${name} (${type})`)
				.join("\n")}`,
			{ telemetryMessage: "preview command previews configuration missing" }
		);
	}

	if (!hasConfiguredValues(baseConfig)) {
		if (!hasConfiguredValues(productionConversion.config)) {
			return config;
		}
		throw new UserError(
			`${MISSING_PREVIEWS_CONFIG_MESSAGE}\n\n${formatConfigSnippet(
				{ previews: productionConversion.config },
				configPath
			)}`,
			{ telemetryMessage: "preview command previews configuration missing" }
		);
	}

	if (
		!hasConfiguredValues(baseConversion.config) &&
		baseConversion.omittedBindings.length > 0
	) {
		return config;
	}

	const format = configFormat(config.userConfigPath);
	const canWriteConfig =
		config.userConfigPath !== undefined &&
		config.userConfigPath === config.configPath &&
		(format === "toml" || JSON_CONFIG_FORMATS.includes(format));
	if (!canWriteConfig || args.json || isNonInteractiveOrCI()) {
		throw new UserError(
			`${MISSING_PREVIEWS_CONFIG_MESSAGE}\n\n${formatConfigSnippet(
				{ previews: baseConversion.config },
				configPath
			)}`,
			{ telemetryMessage: "preview command previews configuration missing" }
		);
	}

	if (!(await confirm(ADD_PREVIEW_BASE_CONFIG_PROMPT))) {
		throw new UserError(
			`${MISSING_PREVIEWS_CONFIG_MESSAGE}\n\n${formatConfigSnippet(
				{ previews: baseConversion.config },
				configPath
			)}`,
			{ telemetryMessage: "preview command previews configuration missing" }
		);
	}

	writePreviewsConfig(config, baseConversion.config);
	return { ...config, previews: baseConversion.config };
}
