import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	generateTypes,
	InputWorkerSchema,
	loadAndValidateConfig,
} from "@cloudflare/config";
import {
	generateRuntimeTypes,
	RUNTIME_TYPES_MARKER,
} from "@cloudflare/runtime-types";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import { defu } from "defu";
import * as vite from "vite";
import { readBuildOutputWorkers } from "./build-output-preview";
import { hasNodeJsCompat, NodeJsCompat } from "./nodejs-compat";
import type { BuildOutputPreviewWorker } from "./build-output-preview";
import type {
	ParsedConfigExports,
	ParsedInputWorkerConfig,
	WorkerConfigInput,
} from "@cloudflare/config";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";

export type PersistState = boolean | { path: string };
export type TunnelConfig = {
	autoStart?: boolean;
	name?: string;
};

interface BaseWorkerConfig {
	viteEnvironment?: { name?: string; childEnvironments?: string[] };
}

/**
 * Whether this Worker is only used during development and should not be built for production.
 * Can be a boolean or a function that returns a boolean. The function is evaluated lazily
 * at build time, allowing frameworks to provide the value after initialization.
 */
type DevOnly = boolean | (() => boolean);

interface EntryWorkerConfig extends BaseWorkerConfig {
	config?: EntryWorkerConfigCustomizer;
	/**
	 * Whether the entry Worker should be omitted from the production build.
	 * Can be a boolean or a function that returns a boolean. The function is
	 * evaluated lazily at build time, allowing frameworks to provide the value
	 * after initialization.
	 *
	 * When set, an assets-only Build Output config is emitted. This enables using
	 * server-side code in development but producing a fully static app for
	 * deployment.
	 */
	assetsOnly?: DevOnly;
}

interface AuxiliaryWorkerConfig extends BaseWorkerConfig {
	config: WorkerConfigProvider;
	devOnly?: DevOnly;
}

interface PrerenderWorkerConfig extends BaseWorkerConfig {
	config: WorkerConfigProvider;
}

interface TypeGenerationOptions {
	/**
	 * Whether to auto-generate `worker-configuration.d.ts` at the project
	 * root. Defaults to `true`.
	 */
	generate?: boolean;
	/**
	 * Whether to include the Worker's runtime types (generated from the
	 * project's compatibility date and flags) in the generated
	 * `worker-configuration.d.ts`. Defaults to `true`.
	 */
	includeRuntime?: boolean;
}

interface ResolvedTypeGenerationOptions {
	generate: boolean;
	includeRuntime: boolean;
}

interface Experimental {
	/** Experimental support for handling the _headers and _redirects files during Vite dev mode. */
	headersAndRedirectsDevModeSupport?: boolean;
	/** Experimental support for a dedicated prerender Worker */
	prerenderWorker?: PrerenderWorkerConfig;
}

function normalizeTypes(
	option: TypeGenerationOptions | undefined
): ResolvedTypeGenerationOptions {
	return {
		generate: option?.generate ?? true,
		includeRuntime: option?.includeRuntime ?? true,
	};
}

type FilteredEntryWorkerConfig = Omit<ParsedInputWorkerConfig, "name" | "type">;

type EntryWorkerConfigCustomizer =
	| Partial<ParsedInputWorkerConfig>
	| ((
			config: ParsedInputWorkerConfig
	  ) => Partial<ParsedInputWorkerConfig> | void);

type WorkerConfigProvider =
	| WorkerConfigInput
	| ((options: {
			entryWorkerConfig: FilteredEntryWorkerConfig;
	  }) => WorkerConfigInput);

export interface PluginConfig extends EntryWorkerConfig {
	auxiliaryWorkers?: AuxiliaryWorkerConfig[];
	persistState?: PersistState;
	inspectorPort?: number | false;
	remoteBindings?: boolean;
	tunnel?: boolean | TunnelConfig;
	/** Options for generating Worker types from `cloudflare.config.ts`. */
	types?: TypeGenerationOptions;
	experimental?: Experimental;
}

export type ResolvedAssetsOnlyConfig = Omit<
	ParsedInputWorkerConfig,
	"entrypoint"
>;

export type ResolvedWorkerConfig = Omit<
	ParsedInputWorkerConfig,
	"entrypoint"
> & {
	entrypoint: string;
};

export interface Worker {
	config: ResolvedWorkerConfig;
	nodeJsCompat: NodeJsCompat | undefined;
	devOnly: DevOnly | undefined;
}

interface BaseResolvedConfig {
	persistState: PersistState;
	inspectorPort: number | false | undefined;
	types: ResolvedTypeGenerationOptions;
	experimental: Pick<Experimental, "headersAndRedirectsDevModeSupport">;
	remoteBindings: boolean;
	tunnel: TunnelConfig;
}

interface NonPreviewResolvedConfig extends BaseResolvedConfig {
	configPaths: Set<string>;
	environmentNameToWorkerMap: Map<string, Worker>;
	environmentNameToChildEnvironmentNamesMap: Map<string, string[]>;
	prerenderWorkerEnvironmentName: string | undefined;
	// The full parsed `cloudflare.config.ts` exports (every worker export plus
	// the optional `settings` export), keyed by export name.
	parsedConfig: ParsedConfigExports;
}

export interface AssetsOnlyResolvedConfig extends NonPreviewResolvedConfig {
	type: "assets-only";
	config: ResolvedAssetsOnlyConfig;
}

export interface WorkersResolvedConfig extends NonPreviewResolvedConfig {
	type: "workers";
	entryWorkerEnvironmentName: string;
	staticRouting: StaticRouting | undefined;
}

export interface PreviewResolvedConfig extends BaseResolvedConfig {
	type: "preview";
	workers: BuildOutputPreviewWorker[];
}

export type ResolvedPluginConfig =
	| AssetsOnlyResolvedConfig
	| WorkersResolvedConfig
	| PreviewResolvedConfig;

function filterEntryWorkerConfig(
	config: ParsedInputWorkerConfig
): FilteredEntryWorkerConfig {
	const { name: _name, type: _type, ...filteredConfig } = config;

	return filteredConfig;
}

export function customizeWorkerConfig(options: {
	workerConfig: ParsedInputWorkerConfig;
	configCustomizer: EntryWorkerConfigCustomizer | undefined;
}): ParsedInputWorkerConfig {
	// The `config` option can either be an object to merge into the worker config,
	// a function that returns such an object, or a function that mutates the worker config in place.
	const configResult =
		typeof options.configCustomizer === "function"
			? options.configCustomizer(options.workerConfig)
			: options.configCustomizer;

	// If the configResult is defined, merge it into the existing config.
	if (configResult) {
		return InputWorkerSchema.parse(defu(configResult, options.workerConfig));
	}

	return InputWorkerSchema.parse(options.workerConfig);
}

type ResolvedWorker =
	| { type: "assets-only"; config: ResolvedAssetsOnlyConfig }
	| { type: "worker"; config: ResolvedWorkerConfig };

const ENTRY_MODULE_EXTENSIONS = [".js", ".mjs", ".ts", ".mts", ".jsx", ".tsx"];

function resolveWorkerEntrypoint(root: string, entrypoint: string): string {
	const isFilePath =
		path.isAbsolute(entrypoint) ||
		entrypoint.startsWith("./") ||
		entrypoint.startsWith("../") ||
		ENTRY_MODULE_EXTENSIONS.some((extension) => entrypoint.endsWith(extension));

	if (!isFilePath) {
		return entrypoint;
	}

	const resolvedEntrypoint = path.resolve(root, entrypoint);
	if (!fs.existsSync(resolvedEntrypoint)) {
		throw new Error(
			`The configured Worker entrypoint (${resolvedEntrypoint}) doesn't point to an existing file`
		);
	}

	return resolvedEntrypoint;
}

/** Resolves a native Worker config and validates its entrypoint. */
function resolveWorkerConfig(options: {
	root: string;
	config: WorkerConfigProvider;
	entryWorkerConfig: ParsedInputWorkerConfig;
}): Extract<ResolvedWorker, { type: "worker" }>;
function resolveWorkerConfig(options: {
	root: string;
	workerConfig: ParsedInputWorkerConfig;
	configCustomizer: EntryWorkerConfigCustomizer | undefined;
}): ResolvedWorker;
function resolveWorkerConfig(
	options:
		| {
				root: string;
				config: WorkerConfigProvider;
				entryWorkerConfig: ParsedInputWorkerConfig;
		  }
		| {
				root: string;
				workerConfig: ParsedInputWorkerConfig;
				configCustomizer: EntryWorkerConfigCustomizer | undefined;
		  }
): ResolvedWorker {
	const isEntryWorker = !("entryWorkerConfig" in options);

	const config =
		"entryWorkerConfig" in options
			? InputWorkerSchema.parse({
					type: "worker",
					...(typeof options.config === "function"
						? options.config({
								entryWorkerConfig: filterEntryWorkerConfig(
									options.entryWorkerConfig
								),
							})
						: options.config),
				})
			: customizeWorkerConfig({
					workerConfig: options.workerConfig,
					configCustomizer: options.configCustomizer,
				});

	if (config.entrypoint === undefined) {
		if (!isEntryWorker) {
			throw new Error(
				"No 'entrypoint' field provided for an inline Worker config"
			);
		}
		if (config.assets === undefined) {
			throw new Error(
				"The default Worker in `cloudflare.config.ts` must configure an `entrypoint` or `assets`."
			);
		}
		const { entrypoint: _entrypoint, ...assetsOnlyConfig } = config;
		return { type: "assets-only", config: assetsOnlyConfig };
	}

	const entrypoint = resolveWorkerEntrypoint(options.root, config.entrypoint);

	return {
		type: "worker",
		config: { ...config, entrypoint },
	};
}

export async function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
	viteEnv: vite.ConfigEnv
): Promise<ResolvedPluginConfig> {
	const mode =
		"mode" in userConfig && typeof userConfig.mode === "string"
			? userConfig.mode
			: viteEnv.mode;
	const types = normalizeTypes(pluginConfig.types);
	const shared = {
		persistState: pluginConfig.persistState ?? true,
		inspectorPort: pluginConfig.inspectorPort,
		types,
		tunnel:
			typeof pluginConfig.tunnel === "boolean"
				? { autoStart: pluginConfig.tunnel }
				: {
						autoStart: pluginConfig.tunnel?.autoStart ?? false,
						name: pluginConfig.tunnel?.name,
					},
		experimental: {
			headersAndRedirectsDevModeSupport:
				pluginConfig.experimental?.headersAndRedirectsDevModeSupport,
		},
	};
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const prefixedEnv = vite.loadEnv(mode, root, [
		"CLOUDFLARE_",
		// TODO: Remove deprecated WRANGLER prefix support in next major version
		"WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_",
	]);

	// Make Cloudflare-prefixed environment variables available while resolving
	// config and starting development services.
	Object.assign(process.env, prefixedEnv);

	// The `cf-vite` delegate binary's `--local` flag sets this env var to
	// force remote bindings off, overriding any `remoteBindings` value in the
	// plugin config (mirrors `wrangler dev --local`).
	const remoteBindings =
		prefixedEnv.CLOUDFLARE_VITE_FORCE_LOCAL === "true"
			? false
			: (pluginConfig.remoteBindings ?? true);

	if (viteEnv.isPreview) {
		return {
			...shared,
			remoteBindings,
			type: "preview",
			workers: await readBuildOutputWorkers(root),
		};
	}

	const configPaths = new Set<string>();
	const validateAndAddEnvironmentName = createEnvironmentNameValidator();

	const loadedConfig = await loadCloudflareConfig({
		root,
		mode,
		command: viteEnv.command,
		types,
	});
	const parsedConfig = loadedConfig.parsedConfig;
	configPaths.add(loadedConfig.configPath);
	for (const dep of loadedConfig.dependencies) {
		configPaths.add(dep);
	}

	// Type generation happens while loading the file above. The plugin-level
	// customizer is intentionally applied afterwards so generated declarations
	// only describe `cloudflare.config.ts`.
	const entryWorkerResolvedConfig = resolveWorkerConfig({
		root,
		workerConfig: parsedConfig.default,
		configCustomizer: pluginConfig.config,
	});

	const environmentNameToWorkerMap = new Map<string, Worker>();
	const environmentNameToChildEnvironmentNamesMap = new Map<string, string[]>();

	const prerenderWorkerConfig = pluginConfig.experimental?.prerenderWorker;
	let prerenderWorkerEnvironmentName: string | undefined;

	if (prerenderWorkerConfig && viteEnv.command === "build") {
		const workerResolvedConfig = resolveWorkerConfig({
			root,
			config: prerenderWorkerConfig.config,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
		});

		prerenderWorkerEnvironmentName =
			prerenderWorkerConfig.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerResolvedConfig.config.name);

		validateAndAddEnvironmentName(prerenderWorkerEnvironmentName);

		environmentNameToWorkerMap.set(
			prerenderWorkerEnvironmentName,
			resolveWorker(workerResolvedConfig.config, undefined)
		);

		const prerenderWorkerChildEnvironments =
			prerenderWorkerConfig.viteEnvironment?.childEnvironments;

		if (prerenderWorkerChildEnvironments) {
			for (const childName of prerenderWorkerChildEnvironments) {
				validateAndAddEnvironmentName(childName);
			}

			environmentNameToChildEnvironmentNamesMap.set(
				prerenderWorkerEnvironmentName,
				prerenderWorkerChildEnvironments
			);
		}
	}

	if (entryWorkerResolvedConfig.type === "assets-only") {
		return {
			...shared,
			type: "assets-only",
			config: entryWorkerResolvedConfig.config,
			parsedConfig,
			environmentNameToWorkerMap,
			environmentNameToChildEnvironmentNamesMap,
			prerenderWorkerEnvironmentName,
			configPaths,
			remoteBindings,
		};
	}

	let staticRouting: StaticRouting | undefined;

	if (Array.isArray(entryWorkerResolvedConfig.config.assets?.runWorkerFirst)) {
		staticRouting = parseStaticRouting(
			entryWorkerResolvedConfig.config.assets.runWorkerFirst
		);
	}

	const entryWorkerEnvironmentName =
		pluginConfig.viteEnvironment?.name ??
		workerNameToEnvironmentName(entryWorkerResolvedConfig.config.name);

	validateAndAddEnvironmentName(entryWorkerEnvironmentName);

	environmentNameToWorkerMap.set(
		entryWorkerEnvironmentName,
		resolveWorker(entryWorkerResolvedConfig.config, pluginConfig.assetsOnly)
	);

	const entryWorkerChildEnvironments =
		pluginConfig.viteEnvironment?.childEnvironments;

	if (entryWorkerChildEnvironments) {
		for (const childName of entryWorkerChildEnvironments) {
			validateAndAddEnvironmentName(childName);
		}

		environmentNameToChildEnvironmentNamesMap.set(
			entryWorkerEnvironmentName,
			entryWorkerChildEnvironments
		);
	}

	for (const auxiliaryWorker of pluginConfig.auxiliaryWorkers ?? []) {
		const workerResolvedConfig = resolveWorkerConfig({
			root,
			config: auxiliaryWorker.config,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
		});

		if (workerResolvedConfig.config.assets) {
			throw new Error("`assets` is not supported on an auxiliary Worker.");
		}

		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerResolvedConfig.config.name);

		validateAndAddEnvironmentName(workerEnvironmentName);

		environmentNameToWorkerMap.set(
			workerEnvironmentName,
			resolveWorker(workerResolvedConfig.config, auxiliaryWorker.devOnly)
		);

		const auxiliaryWorkerChildEnvironments =
			auxiliaryWorker.viteEnvironment?.childEnvironments;

		if (auxiliaryWorkerChildEnvironments) {
			for (const childName of auxiliaryWorkerChildEnvironments) {
				validateAndAddEnvironmentName(childName);
			}

			environmentNameToChildEnvironmentNamesMap.set(
				workerEnvironmentName,
				auxiliaryWorkerChildEnvironments
			);
		}
	}

	return {
		...shared,
		type: "workers",
		configPaths,
		environmentNameToWorkerMap,
		environmentNameToChildEnvironmentNamesMap,
		prerenderWorkerEnvironmentName,
		parsedConfig,
		entryWorkerEnvironmentName,
		staticRouting,
		remoteBindings,
	};
}

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll("-", "_");
}

function createEnvironmentNameValidator() {
	const usedNames = new Set<string>();

	return (name: string): void => {
		if (name === "client") {
			throw new Error(`"client" is a reserved Vite environment name`);
		}

		if (usedNames.has(name)) {
			throw new Error(`Duplicate Vite environment name: "${name}"`);
		}

		usedNames.add(name);
	};
}

/**
 * Evaluates the `devOnly` value. Should be called lazily at build time
 * to allow frameworks to provide the value after initialization.
 */
export function resolveDevOnly(devOnly: DevOnly | undefined): boolean {
	if (typeof devOnly === "function") {
		return devOnly();
	}

	return devOnly ?? false;
}

function resolveWorker(
	workerConfig: ResolvedWorkerConfig,
	devOnly: DevOnly | undefined
): Worker {
	return {
		config: workerConfig,
		nodeJsCompat: hasNodeJsCompat(workerConfig)
			? new NodeJsCompat(workerConfig)
			: undefined,
		devOnly,
	};
}

const CONFIG_FILENAME = "cloudflare.config.ts";
const TYPES_OUTPUT_FILENAME = "worker-configuration.d.ts";
const EXPERIMENTAL_CONFIG_PKG = "@cloudflare/vite-plugin/experimental-config";

/**
 * Load and validate a `cloudflare.config.ts` file via `@cloudflare/config`.
 * Returns the default Worker, all parsed exports, the absolute path of the
 * loaded file, and the set of files imported while resolving the config (for
 * watch-mode).
 *
 * When `types.generate` is true, also writes `worker-configuration.d.ts` next
 * to the config when the generated content differs from what's already on disk.
 * Type generation only runs in dev.
 */
async function loadCloudflareConfig(options: {
	root: string;
	mode: string;
	command: "build" | "serve";
	types: { generate: boolean; includeRuntime: boolean };
}): Promise<{
	parsedConfig: ParsedConfigExports & { default: ParsedInputWorkerConfig };
	configPath: string;
	dependencies: Set<string>;
}> {
	const configPath = path.resolve(options.root, CONFIG_FILENAME);

	if (!fs.existsSync(configPath)) {
		throw new Error(`No \`${CONFIG_FILENAME}\` was found at ${configPath}.`);
	}

	const { result, dependencies } = await loadAndValidateConfig(configPath, {
		mode: options.mode,
	});

	if (!result.success) {
		throw new Error(`Invalid \`${CONFIG_FILENAME}\`:\n${result.error.message}`);
	}

	const worker =
		result.data.default?.type === "worker" ? result.data.default : undefined;

	if (worker === undefined) {
		throw new Error(
			`\`${CONFIG_FILENAME}\` must have a default worker export.`
		);
	}

	if (options.command === "serve" && options.types.generate) {
		await writeWorkerConfigurationDts({
			root: options.root,
			configPath,
			includeRuntime: options.types.includeRuntime,
			compatibilityDate: worker.compatibilityDate,
			compatibilityFlags: worker.compatibilityFlags ?? [],
		});
	}

	return {
		parsedConfig: { ...result.data, default: worker },
		configPath,
		dependencies,
	};
}

/**
 * Write `worker-configuration.d.ts` to the project root using
 * `@cloudflare/config`'s `generateTypes`, targeting the vite-plugin's
 * `experimental-config` subpath (so users don't need a direct dependency on
 * `@cloudflare/config`).
 *
 * When `includeRuntime` is true, appends the Workers runtime types (generated
 * from the project's compatibility date/flags) after the inference block. The
 * runtime-types generator caches against the existing file content, so it only
 * spawns workerd when the compat date/flags/workerd version change.
 *
 * The existing file is read once and reused for both the runtime-types cache
 * check and the diff-before-write (only writes if content differs, to avoid
 * touching mtimes unnecessarily).
 */
async function writeWorkerConfigurationDts(options: {
	root: string;
	configPath: string;
	includeRuntime: boolean;
	compatibilityDate: string;
	compatibilityFlags: string[];
}): Promise<void> {
	const outputPath = path.resolve(options.root, TYPES_OUTPUT_FILENAME);
	const relativeConfigPath =
		"./" + path.relative(options.root, options.configPath);

	let existingContent: string | undefined;
	try {
		existingContent = await fsp.readFile(outputPath, "utf8");
	} catch {
		// File doesn't exist yet — we'll create it below.
	}

	let content = generateTypes({
		configPath: relativeConfigPath,
		packageName: EXPERIMENTAL_CONFIG_PKG,
	});

	if (options.includeRuntime) {
		const { runtimeHeader, runtimeTypes } = await generateRuntimeTypes({
			compatibilityDate: options.compatibilityDate,
			compatibilityFlags: options.compatibilityFlags,
			existingContent,
		});
		content += `\n${runtimeHeader}\n${RUNTIME_TYPES_MARKER}\n${runtimeTypes}`;
	}

	if (existingContent !== content) {
		await fsp.writeFile(outputPath, content);
	}
}
