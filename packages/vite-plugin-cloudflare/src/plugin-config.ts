import * as path from "node:path";
import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	normalizeDirectoryName,
} from "@cloudflare/build-output-utils";
import { InputWorkerSchema } from "@cloudflare/config";
import {
	hasNodeJsCompat,
	loadCloudflareConfig,
	NodeJsCompat,
} from "@cloudflare/workers-dev-shared";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import {
	DEFAULT_COMPAT_DATE,
	getWorkerNameFromProject,
} from "@cloudflare/workers-utils";
import { loadDevVars, loadEnv } from "@cloudflare/workers-utils/local-env";
import { defu } from "defu";
import { PRERENDER_WORKER_DIRECTORY_NAME } from "./build-output";
import { getCliDisplayName, isPreviewBuild } from "./build-output-env";
import { readBuildOutputPreview } from "./build-output-preview";
import type { BuildOutputPreviewWorker } from "./build-output-preview";
import type {
	ParsedInputContainerConfig,
	InputWorkerConfig,
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
	ParsedOutputContainerConfig,
} from "@cloudflare/config";
import type { PersistState } from "@cloudflare/workers-dev-shared";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type { LoadedEnv } from "@cloudflare/workers-utils/local-env";
import type * as vite from "vite";

export type { PersistState };
export type TunnelConfig = {
	autoStart?: boolean;
	name?: string;
	/** Email addresses or domain patterns allowed to authenticate to a Quick Tunnel. */
	allowedMail?: string[];
};

interface BaseWorkerOptions {
	viteEnvironment?: { name?: string; childEnvironments?: string[] };
}

/**
 * Whether this Worker is only used during development and should not be built for production.
 * Can be a boolean or a function that returns a boolean. The function is evaluated lazily
 * at build time, allowing frameworks to provide the value after initialization.
 */
type DevOnly = boolean | (() => boolean);

interface EntryWorkerOptions extends BaseWorkerOptions {
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

interface AuxiliaryWorkerOptions extends BaseWorkerOptions {
	/** Configure an auxiliary Worker. */
	config: WorkerConfigProvider;
	devOnly?: DevOnly;
}

interface PrerenderWorkerOptions extends BaseWorkerOptions {
	config: WorkerConfigProvider;
}

interface TypeGenerationOptions {
	/**
	 * Whether to auto-generate `.cloudflare/types/index.d.ts`. Defaults to
	 * `true`.
	 */
	generate?: boolean;
	/**
	 * Whether to include the Worker's runtime types (generated from the
	 * project's compatibility date and flags) in the generated
	 * `.cloudflare/types/index.d.ts`. Defaults to `true`.
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

type EntryWorkerConfigCustomizer =
	| Partial<ParsedInputWorkerConfig>
	| ((
			config: ParsedInputWorkerConfig
	  ) => Partial<ParsedInputWorkerConfig> | void);

type WorkerConfigProvider =
	| InputWorkerConfig
	| ((options: {
			entryWorkerConfig: ParsedInputWorkerConfig;
	  }) => InputWorkerConfig);

export interface PluginConfig extends EntryWorkerOptions {
	auxiliaryWorkers?: AuxiliaryWorkerOptions[];
	/** Configuration for a dedicated prerender Worker. */
	prerenderWorker?: PrerenderWorkerOptions;
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
	cliDisplayName: string;
	persistState: PersistState;
	inspectorPort: number | false | undefined;
	types: ResolvedTypeGenerationOptions;
	experimental: Pick<Experimental, "headersAndRedirectsDevModeSupport">;
	remoteBindings: boolean;
	tunnel: TunnelConfig;
	localEnv: LoadedEnv;
	devVars: Record<string, string> | undefined;
	settings: ParsedInputSettingsConfig;
}

interface NonPreviewResolvedConfig extends BaseResolvedConfig {
	containers: ParsedInputContainerConfig[];
	configPaths: Set<string>;
	environmentNameToWorkerMap: Map<string, Worker>;
	environmentNameToChildEnvironmentNamesMap: Map<string, string[]>;
	prerenderWorkerEnvironmentName: string | undefined;
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
	containers: ParsedOutputContainerConfig[];
	workers: BuildOutputPreviewWorker[];
}

export type ResolvedPluginConfig =
	| AssetsOnlyResolvedConfig
	| WorkersResolvedConfig
	| PreviewResolvedConfig;

type ResolvedWorker =
	| { type: "assets-only"; config: ResolvedAssetsOnlyConfig }
	| { type: "worker"; config: ResolvedWorkerConfig };

function createDefaultWorkerConfig(name: string): ParsedInputWorkerConfig {
	return {
		name,
		compatibilityDate: DEFAULT_COMPAT_DATE,
	};
}

/** Resolves the entry Worker config. */
function resolveEntryWorkerConfig(options: {
	workerConfig: ParsedInputWorkerConfig;
	configCustomizer: EntryWorkerConfigCustomizer | undefined;
}): ResolvedWorker {
	const configResult =
		typeof options.configCustomizer === "function"
			? options.configCustomizer(options.workerConfig)
			: options.configCustomizer;
	const config = InputWorkerSchema.parse(
		configResult
			? defu(configResult, options.workerConfig)
			: options.workerConfig
	);

	return resolveWorkerType({ config, isEntryWorker: true });
}

/** Resolves an auxiliary or prerender Worker config. */
function resolveNonEntryWorkerConfig(options: {
	config: WorkerConfigProvider;
	entryWorkerConfig: ParsedInputWorkerConfig;
}): Extract<ResolvedWorker, { type: "worker" }> {
	const inputConfig =
		typeof options.config === "function"
			? options.config({ entryWorkerConfig: options.entryWorkerConfig })
			: options.config;
	const config = InputWorkerSchema.parse(inputConfig);

	return resolveWorkerType({ config, isEntryWorker: false });
}

function resolveWorkerType(options: {
	config: ParsedInputWorkerConfig;
	isEntryWorker: false;
}): Extract<ResolvedWorker, { type: "worker" }>;
function resolveWorkerType(options: {
	config: ParsedInputWorkerConfig;
	isEntryWorker: true;
}): ResolvedWorker;
function resolveWorkerType(options: {
	config: ParsedInputWorkerConfig;
	isEntryWorker: boolean;
}): ResolvedWorker {
	const { config, isEntryWorker } = options;

	if (!isEntryWorker && config.assets) {
		throw new Error("assets are only supported by the default Worker");
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

	return {
		type: "worker",
		config: { ...config, entrypoint: config.entrypoint },
	};
}

export async function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
	viteEnv: vite.ConfigEnv
): Promise<ResolvedPluginConfig> {
	if (
		typeof pluginConfig.tunnel === "object" &&
		pluginConfig.tunnel.name !== undefined &&
		(pluginConfig.tunnel.allowedMail?.length ?? 0) > 0
	) {
		throw new Error(
			"`tunnel.allowedMail` is only supported for Quick Tunnels and cannot be used together with `tunnel.name`."
		);
	}
	const mode =
		"mode" in userConfig && typeof userConfig.mode === "string"
			? userConfig.mode
			: viteEnv.mode;
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const envDir = resolveEnvDir(root, userConfig.envDir);
	const preview = viteEnv.isPreview
		? await readBuildOutputPreview(root, !!process.env.CLOUDFLARE_VITE_BUILD)
		: undefined;
	const localEnvMode = preview?.rootConfig.buildContext.mode ?? mode;
	const [localEnv, devVars] = await Promise.all([
		loadEnv(envDir, localEnvMode),
		loadDevVars(envDir, localEnvMode),
	]);
	// TODO: Replace this process-global compatibility bridge by explicitly
	// passing typed Cloudflare tool settings to the services that consume them.
	Object.assign(
		process.env,
		Object.fromEntries(
			Object.entries(localEnv.values).filter(([name]) =>
				name.startsWith("CLOUDFLARE_")
			)
		)
	);
	const types = normalizeTypes(pluginConfig.types);
	const shared = {
		cliDisplayName: getCliDisplayName(),
		persistState: pluginConfig.persistState ?? true,
		inspectorPort: pluginConfig.inspectorPort,
		types,
		tunnel:
			typeof pluginConfig.tunnel === "boolean"
				? { autoStart: pluginConfig.tunnel }
				: {
						autoStart: pluginConfig.tunnel?.autoStart ?? false,
						name: pluginConfig.tunnel?.name,
						allowedMail: pluginConfig.tunnel?.allowedMail?.length
							? pluginConfig.tunnel.allowedMail
							: undefined,
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
		const { accountId, complianceRegion } = preview.rootConfig;
		return {
			...shared,
			remoteBindings,
			type: "preview",
			settings: { accountId, complianceRegion },
			containers: preview.containers,
			workers: preview.workers,
		};
	}

	const configPaths = new Set<string>();
	const validateAndAddEnvironmentName = createEnvironmentNameValidator();

	const loadedConfig = await loadCloudflareConfig({
		root,
		mode,
		isPreview: isPreviewBuild(),
		types,
	});
	const settings = {
		accountId: loadedConfig?.parsedConfig.accountId,
		complianceRegion: loadedConfig?.parsedConfig.complianceRegion,
	};
	const containers = loadedConfig?.parsedConfig.containers ?? [];
	if (loadedConfig) {
		configPaths.add(loadedConfig.configPath);
		for (const dep of loadedConfig.dependencies) {
			configPaths.add(dep);
		}
	}

	// Type generation happens while loading the file above. The plugin-level
	// customizer is intentionally applied afterwards so generated declarations
	// only describe `cloudflare.config.ts`.
	const entryWorkerResolvedConfig = resolveEntryWorkerConfig({
		workerConfig:
			loadedConfig === undefined
				? createDefaultWorkerConfig(getWorkerNameFromProject(root))
				: loadedConfig.parsedConfig.worker,
		configCustomizer: pluginConfig.config,
	});

	const environmentNameToWorkerMap = new Map<string, Worker>();
	const environmentNameToChildEnvironmentNamesMap = new Map<string, string[]>();
	const validateAndAddWorkerName = createWorkerNameValidator();
	validateAndAddWorkerName(entryWorkerResolvedConfig.config.name);

	const prerenderWorkerConfig = pluginConfig.prerenderWorker;
	let prerenderWorkerEnvironmentName: string | undefined;

	if (prerenderWorkerConfig && viteEnv.command === "build") {
		const workerResolvedConfig = resolveNonEntryWorkerConfig({
			config: prerenderWorkerConfig.config,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
		});
		validateAndAddWorkerName(workerResolvedConfig.config.name);

		prerenderWorkerEnvironmentName =
			prerenderWorkerConfig.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerResolvedConfig.config.name);

		validateAndAddEnvironmentName(prerenderWorkerEnvironmentName);

		environmentNameToWorkerMap.set(
			prerenderWorkerEnvironmentName,
			resolveWorker(workerResolvedConfig.config, undefined, "prerender")
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
		addAuxiliaryWorkers({
			auxiliaryWorkers: pluginConfig.auxiliaryWorkers,
			entryWorkerConfig: entryWorkerResolvedConfig.config,
			environmentNameToWorkerMap,
			environmentNameToChildEnvironmentNamesMap,
			validateAndAddEnvironmentName,
			validateAndAddWorkerName,
		});
		return {
			...shared,
			type: "assets-only",
			config: entryWorkerResolvedConfig.config,
			settings,
			containers,
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
		auxiliaryWorkers: pluginConfig.auxiliaryWorkers,
		entryWorkerConfig: entryWorkerResolvedConfig.config,
		environmentNameToWorkerMap,
		environmentNameToChildEnvironmentNamesMap,
		validateAndAddEnvironmentName,
		validateAndAddWorkerName,
	});

	return {
		...shared,
		type: "workers",
		configPaths,
		environmentNameToWorkerMap,
		environmentNameToChildEnvironmentNamesMap,
		prerenderWorkerEnvironmentName,
		settings,
		containers,
		entryWorkerEnvironmentName,
		staticRouting,
		remoteBindings,
	};
}

function addAuxiliaryWorkers(options: {
	auxiliaryWorkers: AuxiliaryWorkerOptions[] | undefined;
	entryWorkerConfig: ParsedInputWorkerConfig;
	environmentNameToWorkerMap: Map<string, Worker>;
	environmentNameToChildEnvironmentNamesMap: Map<string, string[]>;
	validateAndAddEnvironmentName: (name: string) => void;
	validateAndAddWorkerName: (name: string) => void;
}): void {
	const usedDirectoryNames = new Map<string, string>();
	for (const auxiliaryWorker of options.auxiliaryWorkers ?? []) {
		const workerResolvedConfig = resolveNonEntryWorkerConfig({
			config: auxiliaryWorker.config,
			entryWorkerConfig: options.entryWorkerConfig,
		});
		const workerName = workerResolvedConfig.config.name;
		options.validateAndAddWorkerName(workerName);

		const workerDirectoryName = getAuxiliaryWorkerDirectoryName(workerName);
		validateAuxiliaryWorkerDirectoryName({
			workerName,
			workerDirectoryName,
			usedDirectoryNames,
		});
		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerName);
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

const RESERVED_WORKER_DIRECTORY_NAMES = new Set([
	DEFAULT_WORKER_DIRECTORY_NAME,
	PRERENDER_WORKER_DIRECTORY_NAME,
]);

function getAuxiliaryWorkerDirectoryName(workerName: string): string {
	const directoryName = normalizeDirectoryName(workerName);

	return RESERVED_WORKER_DIRECTORY_NAMES.has(directoryName)
		? `_${directoryName}`
		: directoryName;
}

function validateAuxiliaryWorkerDirectoryName(options: {
	workerName: string;
	workerDirectoryName: string;
	usedDirectoryNames: Map<string, string>;
}): void {
	const existingWorkerName = options.usedDirectoryNames.get(
		options.workerDirectoryName
	);
	if (existingWorkerName) {
		throw new Error(
			`The \`${options.workerName}\` and \`${existingWorkerName}\` auxiliary Worker names both produce the Build Output directory name \`${options.workerDirectoryName}\`.`
		);
	}

	options.usedDirectoryNames.set(
		options.workerDirectoryName,
		options.workerName
	);
}

// Worker names can only contain alphanumeric characters and '-' whereas
// environment names can only contain alphanumeric characters and '$', '_'.
function workerNameToEnvironmentName(workerName: string): string {
	return workerName.replaceAll("-", "_");
}

function createWorkerNameValidator() {
	const usedNames = new Set<string>();

	return (name: string): void => {
		if (usedNames.has(name)) {
			throw new Error(`Duplicate Worker name: "${name}"`);
		}

		usedNames.add(name);
	};
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
