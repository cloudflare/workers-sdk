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
import {
	DEFAULT_COMPAT_DATE,
	getWorkerNameFromProject,
} from "@cloudflare/workers-utils";
import { loadDevVars, loadEnv } from "@cloudflare/workers-utils/local-env";
import { defu } from "defu";
import { readBuildOutputPreview } from "./build-output-preview";
import { hasNodeJsCompat, NodeJsCompat } from "./nodejs-compat";
import type { BuildOutputPreviewWorker } from "./build-output-preview";
import type {
	ParsedConfigExports,
	ParsedInputWorkerConfig,
	ParsedOutputSettingsConfig,
} from "@cloudflare/config";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type { LoadedEnv } from "@cloudflare/workers-utils/local-env";
import type * as vite from "vite";

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
	config?: WorkerConfigCustomizer<true>;
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
	/** Customize the Worker config selected from `cloudflare.config.ts`. */
	config?: WorkerConfigCustomizer<false>;
	devOnly?: DevOnly;
}

interface PrerenderWorkerConfig extends BaseWorkerConfig {
	config?: WorkerConfigCustomizer<false>;
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
type WorkerConfigCustomization = Partial<Omit<ParsedInputWorkerConfig, "type">>;

type WorkerConfigCustomizer<TIsEntryWorker extends boolean> =
	| WorkerConfigCustomization
	| ((
			...args: TIsEntryWorker extends true
				? [config: ParsedInputWorkerConfig]
				: [
						config: ParsedInputWorkerConfig,
						options: { entryWorkerConfig: FilteredEntryWorkerConfig },
					]
	  ) => WorkerConfigCustomization | void);

export interface PluginConfig extends EntryWorkerConfig {
	/**
	 * Auxiliary Workers keyed by their named export in `cloudflare.config.ts`, or
	 * by their desired name when configured only here. Every named Worker export
	 * other than the reserved `prerender` export is included whether or not it has
	 * an override here. The key is used as the Vite environment name by default.
	 */
	auxiliaryWorkers?: Record<string, AuxiliaryWorkerConfig>;
	/** Configuration for a dedicated prerender Worker. */
	prerenderWorker?: PrerenderWorkerConfig;
	persistState?: PersistState;
	inspectorPort?: number | false;
	remoteBindings?: boolean;
	tunnel?: boolean | TunnelConfig;
	/**
	 * Options for generating Worker types from `cloudflare.config.ts`. Type
	 * generation is skipped when the file does not exist.
	 */
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
	directoryName: string;
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
	localEnv: LoadedEnv;
	devVars: Record<string, string> | undefined;
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
	settings: ParsedOutputSettingsConfig | undefined;
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
	configCustomizer: WorkerConfigCustomizer<false> | undefined;
	entryWorkerConfig: ParsedInputWorkerConfig;
}): ParsedInputWorkerConfig;
export function customizeWorkerConfig(options: {
	workerConfig: ParsedInputWorkerConfig;
	configCustomizer: WorkerConfigCustomizer<true> | undefined;
}): ParsedInputWorkerConfig;
export function customizeWorkerConfig(
	options:
		| {
				workerConfig: ParsedInputWorkerConfig;
				configCustomizer: WorkerConfigCustomizer<false> | undefined;
				entryWorkerConfig: ParsedInputWorkerConfig;
		  }
		| {
				workerConfig: ParsedInputWorkerConfig;
				configCustomizer: WorkerConfigCustomizer<true> | undefined;
		  }
): ParsedInputWorkerConfig {
	// The `config` option can either be an object to merge into the worker config,
	// a function that returns such an object, or a function that mutates the worker config in place.
	const configResult =
		typeof options.configCustomizer === "function"
			? "entryWorkerConfig" in options
				? options.configCustomizer(options.workerConfig, {
						entryWorkerConfig: filterEntryWorkerConfig(
							options.entryWorkerConfig
						),
					})
				: options.configCustomizer(options.workerConfig)
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

function createDefaultWorkerConfig(name: string): ParsedInputWorkerConfig {
	return {
		type: "worker",
		name,
		compatibilityDate: DEFAULT_COMPAT_DATE,
	};
}

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

/** Resolves a Worker config and validates its entrypoint. */
function resolveWorkerConfig(options: {
	root: string;
	workerConfig: ParsedInputWorkerConfig;
	configCustomizer: WorkerConfigCustomizer<true> | undefined;
}): ResolvedWorker;
function resolveWorkerConfig(options: {
	root: string;
	workerConfig: ParsedInputWorkerConfig;
	configCustomizer: WorkerConfigCustomizer<false> | undefined;
	entryWorkerConfig: ParsedInputWorkerConfig;
}): Extract<ResolvedWorker, { type: "worker" }>;
function resolveWorkerConfig(
	options:
		| {
				root: string;
				workerConfig: ParsedInputWorkerConfig;
				configCustomizer: WorkerConfigCustomizer<true> | undefined;
		  }
		| {
				root: string;
				workerConfig: ParsedInputWorkerConfig;
				configCustomizer: WorkerConfigCustomizer<false> | undefined;
				entryWorkerConfig: ParsedInputWorkerConfig;
		  }
): ResolvedWorker {
	const isEntryWorker = !("entryWorkerConfig" in options);

	const config =
		"entryWorkerConfig" in options
			? customizeWorkerConfig({
					workerConfig: options.workerConfig,
					configCustomizer: options.configCustomizer,
					entryWorkerConfig: options.entryWorkerConfig,
				})
			: customizeWorkerConfig({
					workerConfig: options.workerConfig,
					configCustomizer: options.configCustomizer,
				});

	if (!isEntryWorker && config.assets) {
		throw new Error("`assets` is only supported on the default Worker.");
	}

	if (config.entrypoint === undefined) {
		if (!isEntryWorker) {
			throw new Error(
				"Auxiliary and prerender Workers must configure an `entrypoint`."
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
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const envDir = resolveEnvDir(root, userConfig.envDir);
	const preview = viteEnv.isPreview
		? await readBuildOutputPreview(root, !!process.env.CLOUDFLARE_VITE_BUILD)
		: undefined;
	const localEnvMode = preview ? preview.settings?.mode : mode;
	const [localEnv, devVars] = await Promise.all([
		loadEnv(envDir, localEnvMode),
		loadDevVars(envDir, localEnvMode),
	]);
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
		localEnv,
		devVars,
	};

	// The `cf-vite` delegate binary's `--local` flag sets this env var to
	// force remote bindings off, overriding any `remoteBindings` value in the
	// plugin config (mirrors `wrangler dev --local`).
	const remoteBindings =
		localEnv.values.CLOUDFLARE_VITE_FORCE_LOCAL === "true"
			? false
			: (pluginConfig.remoteBindings ?? true);

	if (preview !== undefined) {
		return {
			...shared,
			remoteBindings,
			type: "preview",
			settings: preview.settings,
			workers: preview.workers,
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
	const parsedConfig = loadedConfig?.parsedConfig ?? {};
	if (loadedConfig) {
		configPaths.add(loadedConfig.configPath);
		for (const dep of loadedConfig.dependencies) {
			configPaths.add(dep);
		}
	}

	// Type generation happens while loading the file above. The plugin-level
	// customizer is intentionally applied afterwards so generated declarations
	// only describe `cloudflare.config.ts`.
	const entryWorkerResolvedConfig = resolveWorkerConfig({
		root,
		workerConfig:
			parsedConfig.default?.type === "worker"
				? parsedConfig.default
				: createDefaultWorkerConfig(getWorkerNameFromProject(root)),
		configCustomizer: pluginConfig.config,
	});

	const environmentNameToWorkerMap = new Map<string, Worker>();
	const environmentNameToChildEnvironmentNamesMap = new Map<string, string[]>();

	const prerenderWorkerConfig = pluginConfig.prerenderWorker;
	const exportedPrerenderWorkerConfig = parsedConfig.prerender;
	const prerenderWorkerBaseConfig =
		exportedPrerenderWorkerConfig?.type === "worker"
			? exportedPrerenderWorkerConfig
			: prerenderWorkerConfig
				? createDefaultWorkerConfig("prerender")
				: undefined;
	let prerenderWorkerEnvironmentName: string | undefined;

	if (prerenderWorkerBaseConfig && viteEnv.command === "build") {
		const workerResolvedConfig = resolveWorkerConfig({
			root,
			workerConfig: prerenderWorkerBaseConfig,
			configCustomizer: prerenderWorkerConfig?.config,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
		});

		prerenderWorkerEnvironmentName =
			prerenderWorkerConfig?.viteEnvironment?.name ?? "prerender";

		validateAndAddEnvironmentName(prerenderWorkerEnvironmentName);

		environmentNameToWorkerMap.set(
			prerenderWorkerEnvironmentName,
			resolveWorker(workerResolvedConfig.config, undefined, "prerender")
		);

		const prerenderWorkerChildEnvironments =
			prerenderWorkerConfig?.viteEnvironment?.childEnvironments;

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
		addAuxiliaryWorkers({
			root,
			auxiliaryWorkers: pluginConfig.auxiliaryWorkers,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
			parsedConfig,
			environmentNameToWorkerMap,
			environmentNameToChildEnvironmentNamesMap,
			validateAndAddEnvironmentName,
		});
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
		pluginConfig.viteEnvironment?.name ?? "ssr";

	validateAndAddEnvironmentName(entryWorkerEnvironmentName);

	environmentNameToWorkerMap.set(
		entryWorkerEnvironmentName,
		resolveWorker(
			entryWorkerResolvedConfig.config,
			pluginConfig.assetsOnly,
			"default"
		)
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

	addAuxiliaryWorkers({
		root,
		auxiliaryWorkers: pluginConfig.auxiliaryWorkers,
		entryWorkerConfig: entryWorkerResolvedConfig.config,
		parsedConfig,
		environmentNameToWorkerMap,
		environmentNameToChildEnvironmentNamesMap,
		validateAndAddEnvironmentName,
	});

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

function addAuxiliaryWorkers(options: {
	root: string;
	auxiliaryWorkers: Record<string, AuxiliaryWorkerConfig> | undefined;
	entryWorkerConfig: ParsedInputWorkerConfig;
	parsedConfig: ParsedConfigExports;
	environmentNameToWorkerMap: Map<string, Worker>;
	environmentNameToChildEnvironmentNamesMap: Map<string, string[]>;
	validateAndAddEnvironmentName: (name: string) => void;
}): void {
	const usedDirectoryNames = new Map<string, string>();
	for (const exportName of Object.keys(options.auxiliaryWorkers ?? {})) {
		if (RESERVED_WORKER_EXPORT_NAMES.has(exportName)) {
			throw new Error(
				`The \`${exportName}\` export is reserved and cannot be configured through \`auxiliaryWorkers\`.`
			);
		}
	}

	const auxiliaryWorkerNames = new Set(
		Object.keys(options.auxiliaryWorkers ?? {})
	);
	for (const [exportName, exportedConfig] of Object.entries(
		options.parsedConfig
	)) {
		if (
			!RESERVED_WORKER_EXPORT_NAMES.has(exportName) &&
			exportedConfig.type === "worker"
		) {
			auxiliaryWorkerNames.add(exportName);
		}
	}

	for (const exportName of auxiliaryWorkerNames) {
		const auxiliaryWorker = options.auxiliaryWorkers?.[exportName] ?? {};
		const exportedConfig = options.parsedConfig[exportName];
		if (exportedConfig && exportedConfig.type !== "worker") {
			throw new Error(
				`The \`${exportName}\` export of \`${CONFIG_FILENAME}\` is not a Worker config.`
			);
		}

		const workerResolvedConfig = resolveWorkerConfig({
			root: options.root,
			workerConfig: exportedConfig ?? createDefaultWorkerConfig(exportName),
			configCustomizer: auxiliaryWorker.config,
			entryWorkerConfig: options.entryWorkerConfig,
		});

		const workerDirectoryName = workerExportNameToDirectoryName(exportName);
		validateAuxiliaryWorkerDirectoryName({
			exportName,
			workerDirectoryName,
			usedDirectoryNames,
		});
		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ?? exportName;
		options.validateAndAddEnvironmentName(workerEnvironmentName);

		options.environmentNameToWorkerMap.set(
			workerEnvironmentName,
			resolveWorker(
				workerResolvedConfig.config,
				auxiliaryWorker.devOnly,
				workerDirectoryName
			)
		);

		const childEnvironmentNames =
			auxiliaryWorker.viteEnvironment?.childEnvironments;
		if (childEnvironmentNames) {
			for (const childName of childEnvironmentNames) {
				options.validateAndAddEnvironmentName(childName);
			}
			options.environmentNameToChildEnvironmentNamesMap.set(
				workerEnvironmentName,
				childEnvironmentNames
			);
		}
	}
}

/**
 * Resolves Vite's environment directory before `configResolved` is available.
 *
 * @param root The already-resolved Vite root.
 * @param envDir The user-provided Vite `envDir` option.
 * @returns An absolute environment directory, or `false` when disabled.
 */
export function resolveEnvDir(
	root: string,
	envDir: string | false | undefined
): string | false {
	return envDir === false ? false : path.resolve(root, envDir ?? ".");
}

const RESERVED_WORKER_EXPORT_NAMES = new Set(["default", "prerender"]);
const RESERVED_WORKER_DIRECTORY_NAMES = new Set([
	...RESERVED_WORKER_EXPORT_NAMES,
	"con",
	"prn",
	"aux",
	"nul",
	...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
	...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/** Convert a Worker export name to its human-readable Build Output directory. */
export function workerExportNameToDirectoryName(exportName: string): string {
	return exportName
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.replace(/([a-z\d])([A-Z])/g, "$1-$2")
		.replace(/[^a-zA-Z\d]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}

function validateAuxiliaryWorkerDirectoryName(options: {
	exportName: string;
	workerDirectoryName: string;
	usedDirectoryNames: Map<string, string>;
}): void {
	if (!options.workerDirectoryName) {
		throw new Error(
			`The \`${options.exportName}\` auxiliary Worker export does not produce a valid Build Output directory name.`
		);
	}
	if (RESERVED_WORKER_DIRECTORY_NAMES.has(options.workerDirectoryName)) {
		throw new Error(
			`The \`${options.exportName}\` auxiliary Worker export produces the reserved Build Output directory name \`${options.workerDirectoryName}\`.`
		);
	}

	const existingExportName = options.usedDirectoryNames.get(
		options.workerDirectoryName
	);
	if (existingExportName) {
		throw new Error(
			`The \`${options.exportName}\` and \`${existingExportName}\` auxiliary Worker exports both produce the Build Output directory name \`${options.workerDirectoryName}\`.`
		);
	}

	options.usedDirectoryNames.set(
		options.workerDirectoryName,
		options.exportName
	);
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
	devOnly: DevOnly | undefined,
	directoryName: string
): Worker {
	return {
		config: workerConfig,
		directoryName,
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
 * Load and validate `cloudflare.config.ts` via `@cloudflare/config`, if it
 * exists. Returns all parsed exports, the absolute path of the loaded file, and
 * the files imported while resolving the config (for watch-mode).
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
}): Promise<
	| {
			parsedConfig: ParsedConfigExports;
			configPath: string;
			dependencies: Set<string>;
	  }
	| undefined
> {
	const configPath = path.resolve(options.root, CONFIG_FILENAME);

	if (!fs.existsSync(configPath)) {
		return;
	}

	const { result, dependencies } = await loadAndValidateConfig(configPath, {
		mode: options.mode,
	});

	if (!result.success) {
		throw new Error(`Invalid \`${CONFIG_FILENAME}\`:\n${result.error.message}`);
	}

	const worker = result.data.default;
	if (
		worker?.type === "worker" &&
		options.command === "serve" &&
		options.types.generate
	) {
		await writeWorkerConfigurationDts({
			root: options.root,
			configPath,
			includeRuntime: options.types.includeRuntime,
			compatibilityDate: worker.compatibilityDate,
			compatibilityFlags: worker.compatibilityFlags ?? [],
		});
	}

	return {
		parsedConfig: result.data,
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
