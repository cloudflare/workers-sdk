import {
	getPreviewBaseConfig,
	extractConfigBindings,
	isWorkerNotFoundError,
	preview,
	resolveWorkerName,
} from "@cloudflare/deploy-helpers";
import {
	experimental_patchConfig,
	formatConfigSnippet,
	getBindingTypeFriendlyName,
	getWranglerTmpDir,
	isNonInteractiveOrCI,
	UserError,
	mapWorkerMetadataBindings,
	PREVIEW_BINDING_CONFIG_FIELDS,
} from "@cloudflare/workers-utils";
import { getAssetsOptions } from "../assets";
import { readConfig } from "../config";
import { getNormalizedContainerOptions } from "../containers/config";
import { createCommand } from "../core/create-command";
import { getEntry } from "../deployment-bundle/entry";
import { buildWorker } from "../deployment-bundle/maybe-build-worker";
import { cleanupDestination } from "../deployment-bundle/merge-config-args";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { writeOutput } from "../output";
import { requireAuth } from "../user";
import { deployPreviewContainers, verifyContainersScope } from "./containers";
import type { PreviewBaseConfig } from "@cloudflare/deploy-helpers";
import type {
	Config,
	PreviewsConfig,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

function configFromPreviewBaseConfig({
	env,
	tail_consumers,
	observability,
	logpush,
	limits,
	placement,
	cache,
}: PreviewBaseConfig): PreviewsConfig {
	const previewBaseBindings = Object.entries(env ?? {})
		.filter(
			([, binding]) =>
				!(binding.type === "ai" && binding.staging !== undefined) &&
				!(binding.type === "service" && "cross_account_grant" in binding)
		)
		.map(([name, binding]) => ({ ...binding, name }) as WorkerMetadataBinding);
	const bindings = mapWorkerMetadataBindings(previewBaseBindings);

	const supportedBindings = Object.fromEntries(
		PREVIEW_BINDING_CONFIG_FIELDS.filter(
			(field) => field !== "unsafe" && bindings[field] !== undefined
		).map((field) => [field, bindings[field]])
	);

	return {
		...(observability !== undefined && { observability }),
		...(logpush !== undefined && { logpush }),
		...(limits !== undefined && { limits }),
		...(placement !== undefined && { placement }),
		...(cache !== undefined && { cache }),
		...supportedBindings,
		...(tail_consumers && {
			tail_consumers: tail_consumers.map(({ name }) => ({ service: name })),
		}),
	};
}

const REPLACE_ME = "<REPLACE_ME>";
const PREVIEW_CONFIG_FIELDS = [
	...PREVIEW_BINDING_CONFIG_FIELDS,
	"define",
	"tail_consumers",
	"streaming_tail_consumers",
	"unsafe_hello_world",
	"logpush",
	"observability",
	"limits",
	"placement",
	"cache",
] as const;

function containsReplaceMe(value: unknown): boolean {
	if (value === REPLACE_ME) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some(containsReplaceMe);
	}
	if (value !== null && typeof value === "object") {
		return Object.entries(value).some(
			([key, nestedValue]) =>
				key === REPLACE_ME || containsReplaceMe(nestedValue)
		);
	}
	return false;
}

function isConfigured(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.length > 0;
	}
	if (value !== null && typeof value === "object") {
		return Object.values(value).some(isConfigured);
	}
	return value !== undefined;
}

function isPreviewsConfigComplete(value: PreviewsConfig | undefined): boolean {
	if (value === undefined) {
		return false;
	}
	if (Object.keys(value).length === 0) {
		return true;
	}
	return PREVIEW_CONFIG_FIELDS.some((field) => Object.hasOwn(value, field));
}

function formatList(items: string[]): string {
	if (items.length <= 1) {
		return items[0] ?? "";
	}
	if (items.length === 2) {
		return items.join(" and ");
	}
	return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function getProductionBindings(config: Config) {
	const bindings = extractConfigBindings({
		...config,
		assets: undefined,
		previews: config,
	});
	for (const binding of config.unsafe?.bindings ?? []) {
		delete bindings[binding.name];
	}
	return bindings;
}

function getUnsupportedProductionBindings(config: Config): Array<{
	name?: string;
	label: string;
}> {
	const bindings = (field: string, values: { binding: string }[] | undefined) =>
		(values ?? []).map(({ binding }) => ({
			name: binding,
			label: `${field}.${binding}`,
		}));

	return [
		...bindings("ai_search_namespaces", config.ai_search_namespaces),
		...bindings("ai_search", config.ai_search),
		...bindings("agent_memory", config.agent_memory),
		...(config.websearch
			? [
					{
						name: config.websearch.binding,
						label: `websearch.${config.websearch.binding}`,
					},
				]
			: []),
		...bindings("vpc_networks", config.vpc_networks),
		...(config.connect.length > 0 ? [{ label: "connect" }] : []),
		...(config.unsafe?.bindings ?? []).map((binding) => ({
			name: binding.name,
			label: `unsafe.${binding.name} (${binding.type})`,
		})),
	];
}

function getUnsupportedProductionBindingsWarning(
	config: Config,
	baseConfig?: PreviewBaseConfig
): string {
	const baseBindingNames = new Set(Object.keys(baseConfig?.env ?? {}));
	const unsupportedBindings = getUnsupportedProductionBindings(config).filter(
		({ name }) => name === undefined || !baseBindingNames.has(name)
	);
	if (unsupportedBindings.length === 0) {
		return "";
	}
	return `\n\nWrangler cannot safely generate Preview configuration for these production fields:\n${unsupportedBindings.map(({ label }) => `  - ${label}`).join("\n")}\nConfigure Preview-safe values manually. Production values were not shown.`;
}

function getRemoteOnlyPreviewBaseBindings(
	baseConfig: PreviewBaseConfig
): string[] {
	return Object.entries(baseConfig.env ?? {}).flatMap(([name, binding]) => {
		if (binding.type === "secret_text" || binding.type === "secret_key") {
			return [`${name} (${binding.type})`];
		}
		if (
			(binding.type === "ai" && binding.staging !== undefined) ||
			(binding.type === "service" && "cross_account_grant" in binding)
		) {
			return [`${name} (${binding.type})`];
		}
		const mappedBinding = mapWorkerMetadataBindings([
			{ ...binding, name } as WorkerMetadataBinding,
		]);
		const canWriteSafely = PREVIEW_BINDING_CONFIG_FIELDS.some(
			(field) => field !== "unsafe" && mappedBinding[field] !== undefined
		);
		return canWriteSafely ? [] : [`${name} (${binding.type})`];
	});
}

function getProductionResourceWarning(
	productionBindings: ReturnType<typeof getProductionBindings>
): string {
	const bindingTypes = [
		...new Set(
			Object.values(productionBindings).map(({ type }) =>
				getBindingTypeFriendlyName(
					type as Parameters<typeof getBindingTypeFriendlyName>[0]
				)
			)
		),
	];
	if (bindingTypes.length === 0) {
		return "";
	}
	return `\n\nDo not reuse production binding configuration for ${formatList(bindingTypes)} unless you intentionally want Preview traffic to share production resources.`;
}

function replaceProductionBindingValues(
	binding: WorkerMetadataBinding
): WorkerMetadataBinding {
	switch (binding.type) {
		case "plain_text":
			return { ...binding, text: REPLACE_ME };
		case "json":
			return {
				...binding,
				json: REPLACE_ME,
			};
		case "kv_namespace":
			return { ...binding, namespace_id: REPLACE_ME };
		case "d1":
			return { ...binding, database_id: REPLACE_ME };
		case "r2_bucket":
			return { ...binding, bucket_name: REPLACE_ME };
		case "service":
			return {
				...binding,
				cross_account_grant: undefined,
				service: REPLACE_ME,
				...(binding.environment !== undefined && {
					environment: REPLACE_ME,
				}),
			};
		case "durable_object_namespace":
			return {
				...binding,
				...(binding.script_name !== undefined && { script_name: REPLACE_ME }),
				...(binding.environment !== undefined && { environment: REPLACE_ME }),
			};
		case "workflow":
			return {
				...binding,
				workflow_name: REPLACE_ME,
				...(binding.script_name !== undefined && { script_name: REPLACE_ME }),
			};
		case "queue":
			return { ...binding, queue_name: REPLACE_ME };
		case "vectorize":
			return { ...binding, index_name: REPLACE_ME };
		case "hyperdrive":
			return { ...binding, id: REPLACE_ME };
		case "analytics_engine":
			return { ...binding, dataset: REPLACE_ME };
		case "dispatch_namespace":
			return {
				...binding,
				namespace: REPLACE_ME,
				...(binding.outbound && {
					outbound: {
						...binding.outbound,
						worker: {
							...binding.outbound.worker,
							service: REPLACE_ME,
							...(binding.outbound.worker.environment !== undefined && {
								environment: REPLACE_ME,
							}),
						},
					},
				}),
			};
		case "send_email":
			return {
				...binding,
				...(binding.destination_address !== undefined && {
					destination_address: REPLACE_ME,
				}),
				...(binding.allowed_destination_addresses !== undefined && {
					allowed_destination_addresses:
						binding.allowed_destination_addresses.map(() => REPLACE_ME),
				}),
				...(binding.allowed_sender_addresses !== undefined && {
					allowed_sender_addresses: binding.allowed_sender_addresses.map(
						() => REPLACE_ME
					),
				}),
			};
		case "mtls_certificate":
			return { ...binding, certificate_id: REPLACE_ME };
		case "pipelines":
			return {
				...binding,
				...(binding.stream !== undefined && { stream: REPLACE_ME }),
				...(binding.pipeline !== undefined && { pipeline: REPLACE_ME }),
			};
		case "secrets_store_secret":
			return { ...binding, store_id: REPLACE_ME, secret_name: REPLACE_ME };
		case "artifacts":
			return { ...binding, namespace: REPLACE_ME };
		case "flagship":
			return { ...binding, app_id: REPLACE_ME };
		case "ratelimit":
			return { ...binding, namespace_id: REPLACE_ME };
		case "vpc_service":
			return { ...binding, service_id: REPLACE_ME };
		case "ai_search_namespace":
			return { ...binding, namespace: REPLACE_ME };
		case "ai_search":
			return { ...binding, instance_name: REPLACE_ME };
		case "agent_memory":
			return { ...binding, namespace: REPLACE_ME };
		case "ai":
			return { name: binding.name, type: binding.type };
		default:
			return binding;
	}
}

/**
 * Converts production bindings into a Preview configuration template without
 * copying production resource identifiers.
 */
export function getPreviewConfigFromProductionBindings(
	config: Config,
	productionBindings: ReturnType<typeof getProductionBindings>
): PreviewsConfig {
	const unsafeBindingNames = new Set(
		(config.unsafe?.bindings ?? []).map(({ name }) => name)
	);
	const safeProductionBindings = Object.fromEntries(
		Object.entries(productionBindings).filter(
			([name]) => !unsafeBindingNames.has(name)
		)
	);
	if (Object.keys(safeProductionBindings).length === 0) {
		return {};
	}
	const bindings = mapWorkerMetadataBindings(
		Object.entries(safeProductionBindings).map(([name, binding]) =>
			replaceProductionBindingValues({
				...binding,
				name,
			} as WorkerMetadataBinding)
		)
	);
	return Object.fromEntries(
		PREVIEW_BINDING_CONFIG_FIELDS.filter(
			(field) => field !== "unsafe" && bindings[field] !== undefined
		).map((field) => [field, bindings[field]])
	) as PreviewsConfig;
}

function missingPreviewsConfigError(
	previews: PreviewsConfig,
	configPath: Config["configPath"],
	detail = ""
): UserError {
	const snippet = formatConfigSnippet({ previews }, configPath);
	return new UserError(
		`Your Wrangler configuration is missing a \`previews\` block. Add the following to your configuration file:\n\n${snippet}${detail}`,
		{ telemetryMessage: "preview command previews configuration missing" }
	);
}

function getUserPreviewsConfig(config: Config): PreviewsConfig | undefined {
	if (
		config.userConfigPath === undefined ||
		config.userConfigPath === config.configPath
	) {
		return config.previews;
	}

	return readConfig({
		config: config.userConfigPath,
		env: config.targetEnvironment,
	}).previews;
}

function mergePreviewsConfig(
	generated: PreviewsConfig | undefined,
	userOwned: PreviewsConfig | undefined
): PreviewsConfig | undefined {
	if (generated === undefined || userOwned === undefined) {
		return userOwned ?? generated;
	}
	const merged: Record<string, unknown> = { ...generated, ...userOwned };
	for (const [field, value] of Object.entries(userOwned)) {
		const generatedValue = (generated as Record<string, unknown>)[field];
		if (Array.isArray(value) && Array.isArray(generatedValue)) {
			merged[field] = mergeConfigArrays(generatedValue, value);
			continue;
		}
		if (
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			generatedValue !== null &&
			typeof generatedValue === "object" &&
			!Array.isArray(generatedValue)
		) {
			const mergedObject: Record<string, unknown> = {
				...generatedValue,
				...value,
			};
			for (const [nestedField, nestedValue] of Object.entries(value)) {
				const generatedNestedValue = (
					generatedValue as Record<string, unknown>
				)[nestedField];
				if (Array.isArray(nestedValue) && Array.isArray(generatedNestedValue)) {
					mergedObject[nestedField] = mergeConfigArrays(
						generatedNestedValue,
						nestedValue
					);
				}
			}
			merged[field] = mergedObject;
		}
	}
	return merged as PreviewsConfig;
}

function mergeConfigArrays(
	generated: unknown[],
	userOwned: unknown[]
): unknown[] {
	if (generated.length === 0 || userOwned.length === 0) {
		return userOwned;
	}
	for (const field of ["binding", "name", "class_name", "service", "tag"]) {
		const getKey = (value: unknown) =>
			value !== null &&
			typeof value === "object" &&
			typeof (value as Record<string, unknown>)[field] === "string"
				? `${field}:${String((value as Record<string, unknown>)[field])}`
				: undefined;
		const entries = [...generated, ...userOwned];
		if (entries.every((entry) => getKey(entry) !== undefined)) {
			const merged = new Map(generated.map((entry) => [getKey(entry), entry]));
			for (const entry of userOwned) {
				merged.set(getKey(entry), entry);
			}
			return [...merged.values()];
		}
	}
	return userOwned;
}

async function ensurePreviewsConfig(
	accountId: string,
	args: {
		workerName?: string;
		"worker-name"?: string;
		ignoreBaseConfig?: boolean;
		json?: boolean;
	},
	config: Config
): Promise<Config> {
	const userPreviews = getUserPreviewsConfig(config);
	const isRedirectedConfig = config.userConfigPath !== config.configPath;
	if (isPreviewsConfigComplete(userPreviews)) {
		const effectivePreviews = isRedirectedConfig
			? mergePreviewsConfig(config.previews, userPreviews)
			: config.previews;
		if (!containsReplaceMe(effectivePreviews)) {
			return { ...config, previews: effectivePreviews };
		}
		throw new UserError(
			`Your \`previews\` configuration still contains ${REPLACE_ME} placeholders. Replace them with Preview-safe values before creating a Preview.`,
			{
				telemetryMessage:
					"preview command unresolved configuration placeholder",
			}
		);
	}
	const previewConfig = { ...config, previews: undefined };

	const editableConfigPath = isRedirectedConfig
		? config.userConfigPath
		: config.configPath;
	const snippetConfigPath = editableConfigPath ?? config.configPath;
	const productionBindings = getProductionBindings(previewConfig);
	const productionPreviews = getPreviewConfigFromProductionBindings(
		previewConfig,
		productionBindings
	);
	const workerName = resolveWorkerName(args, previewConfig);
	let baseConfig: PreviewBaseConfig | undefined;
	if (!args.ignoreBaseConfig) {
		try {
			baseConfig = await getPreviewBaseConfig(
				previewConfig,
				accountId,
				workerName
			);
		} catch (error) {
			if (
				previewConfig.previews === undefined &&
				!isWorkerNotFoundError(error)
			) {
				throw error;
			}
		}
	}
	const unsupportedWarning = getUnsupportedProductionBindingsWarning(
		previewConfig,
		baseConfig
	);

	if (baseConfig === undefined || !isConfigured(baseConfig)) {
		if (Object.keys(productionPreviews).length === 0) {
			if (unsupportedWarning !== "") {
				throw missingPreviewsConfigError(
					{},
					snippetConfigPath,
					unsupportedWarning
				);
			}
			return {
				...previewConfig,
				previews: isRedirectedConfig ? config.previews : previewConfig.previews,
			};
		}
		throw missingPreviewsConfigError(
			productionPreviews,
			snippetConfigPath,
			getProductionResourceWarning(productionBindings) + unsupportedWarning
		);
	}

	const previews = configFromPreviewBaseConfig(baseConfig ?? {});
	const effectivePreviews = mergePreviewsConfig(
		isRedirectedConfig ? config.previews : undefined,
		previews
	);
	const remoteOnlyBindings = getRemoteOnlyPreviewBaseBindings(baseConfig);
	if (!args.json && remoteOnlyBindings.length > 0) {
		logger.info(
			`Wrangler kept these Preview Base bindings remote because it cannot safely write them to local configuration:\n${remoteOnlyBindings.map((binding) => `  - ${binding}`).join("\n")}\nOnly binding names and types were shown.`
		);
	}
	if (unsupportedWarning !== "") {
		throw missingPreviewsConfigError(
			previews,
			snippetConfigPath,
			unsupportedWarning
		);
	}
	if (Object.keys(previews).length === 0) {
		return { ...previewConfig, previews: effectivePreviews };
	}
	if (editableConfigPath === undefined || isNonInteractiveOrCI()) {
		throw missingPreviewsConfigError(previews, snippetConfigPath);
	}

	if (
		!(await confirm(
			"Would you like Wrangler to add the Preview Base configuration to your config file?"
		))
	) {
		throw missingPreviewsConfigError(previews, snippetConfigPath);
	}

	try {
		experimental_patchConfig(
			editableConfigPath,
			previewConfig.targetEnvironment === undefined
				? { previews }
				: { env: { [previewConfig.targetEnvironment]: { previews } } },
			false
		);
	} catch {
		throw missingPreviewsConfigError(previews, snippetConfigPath);
	}

	return { ...previewConfig, previews: effectivePreviews };
}

export const previewCommand = createCommand({
	metadata: {
		description: "👀 Create a Preview deployment of the current Worker",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Preview (defaults to current git branch)",
			type: "string",
			requiresArg: true,
		},
		tag: {
			describe: "A tag for this Preview deployment",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe: "A descriptive message for this Preview deployment",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
		"ignore-base-config": {
			describe:
				"Only use settings from your config file, ignoring the Preview base config configured in the Cloudflare dashboard",
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
		useConfigRedirectIfAvailable: true,
		printBanner: (args) => args.json !== true,
		suggestSkillsAfterHandler: (args) => args.json !== true,
	},
	handler: async function previewHandler(args, { config }) {
		const accountId = await requireAuth(config);
		const previewConfig = await ensurePreviewsConfig(accountId, args, config);

		const entry = await getEntry(
			{ script: args.script },
			previewConfig,
			"deploy"
		);
		const destination = getWranglerTmpDir(entry.projectRoot, "preview");
		const buildResult = await buildWorker(
			{
				entry,
				name: previewConfig.name,
				compatibilityDate: previewConfig.compatibility_date,
				compatibilityFlags: previewConfig.compatibility_flags,
				uploadSourceMaps: previewConfig.upload_source_maps,
				jsxFactory: previewConfig.jsx_factory,
				jsxFragment: previewConfig.jsx_fragment,
				tsconfig: previewConfig.tsconfig,
				minify: previewConfig.minify,
				noBundle: previewConfig.no_bundle ?? false,
				defines: previewConfig.previews?.define ?? {},
				alias: { ...previewConfig.alias },
				doBindings: previewConfig.previews?.durable_objects?.bindings ?? [],
				workflowBindings: previewConfig.previews?.workflows ?? [],
				destination,
				outdir: undefined,
				metafile: undefined,
			},
			previewConfig
		);

		const assetsOptions = getAssetsOptions({
			args: { assets: undefined, script: args.script },
			config: previewConfig,
		});

		const { preview: previewResource, deployment } = await preview(
			accountId,
			args,
			previewConfig,
			buildResult,
			assetsOptions,
			{
				getNormalizedContainerOptions,
				deployPreviewContainers,
				verifyContainersScope,
			}
		);
		cleanupDestination(destination);

		writeOutput({
			type: "preview",
			version: 1,
			worker_name: previewResource.worker_name,
			preview_id: previewResource.id,
			preview_name: previewResource.name,
			preview_slug: previewResource.slug,
			preview_urls: previewResource.urls,
			deployment_id: deployment.id,
			deployment_urls: deployment.urls,
		});
	},
});
