import { existsSync } from "node:fs";
import { loadAndParseConfig } from "@cloudflare/config";
import { formatZodError, getZoneFromRoute } from "@cloudflare/workers-utils";
import { loadDevVars, loadEnv } from "@cloudflare/workers-utils/local-env";
import { Log, LogLevel, resolveLocalBindings } from "miniflare";
import type {
	ParsedInputConfig,
	ParsedInputWorkerConfig,
} from "@cloudflare/config";
import type { RemoteProxyConnectionString, WorkerOptions } from "miniflare";

export const NEW_CONFIG_FILENAME = "cloudflare.config.ts";

const log = new Log(LogLevel.INFO, { prefix: "vpw" });

export interface LoadedNewConfig {
	settings: Pick<ParsedInputConfig, "accountId" | "complianceRegion">;
	worker: ParsedInputWorkerConfig;
	/** The mode config functions were called with. */
	mode: string;
	/** Values resolved from `.env` files and the process environment. */
	localEnv: Record<string, string>;
	/** Values from the selected `.dev.vars` file, if there is one. */
	devVars: Record<string, string> | undefined;
}

/**
 * Load a `cloudflare.config.ts` in the shape Miniflare's native
 * `WorkerOptions.config` accepts, without converting it to a Wrangler config.
 *
 * Loads and parses it with `@cloudflare/config`, then loads the `.env` and
 * `.dev.vars` values in Vite's `envDir` that its secrets and Hyperdrive
 * bindings are resolved from, once `miniflare` options are merged. Unlike
 * `@cloudflare/vite-plugin`, it doesn't copy `CLOUDFLARE_*` tool settings into
 * `process.env`, because Vitest runs every project in one process.
 *
 * @param configPath Absolute path to the `cloudflare.config.ts` file.
 * @param mode The Vite mode, passed to config functions as `ctx.mode` and used
 * to select mode-specific `.env`/`.dev.vars` files.
 * @param envDir Vite's resolved `envDir`, or `false` to load no files.
 * @returns The parsed config and the local values for its bindings.
 */
export async function loadNewConfig(
	configPath: string,
	mode: string,
	envDir: string | false
): Promise<LoadedNewConfig> {
	if (!existsSync(configPath)) {
		throw new TypeError(
			`\`config\` is enabled but no \`${NEW_CONFIG_FILENAME}\` was found at ${configPath}.`
		);
	}

	const { result } = await loadAndParseConfig(configPath, {
		isPreview: false,
		mode,
	});

	if (!result.success) {
		throw new TypeError(
			`Invalid \`${NEW_CONFIG_FILENAME}\`:\n${formatZodError(result.error)}`
		);
	}

	const worker = result.data.worker;

	if (worker === undefined) {
		throw new TypeError(
			`\`${NEW_CONFIG_FILENAME}\` must define a Worker using the \`worker\` property.`
		);
	}

	const [localEnv, devVars] = await Promise.all([
		loadEnv(envDir, mode),
		loadDevVars(envDir, mode),
	]);
	return {
		settings: {
			accountId: result.data.accountId,
			complianceRegion: result.data.complianceRegion,
		},
		worker,
		mode,
		localEnv: localEnv.values,
		devVars,
	};
}

// Binding types a Worker can only have one of. Copied from
// `SINGLETON_BINDING_TYPES` in `packages/config/src/schema.ts`; keep the two in
// sync.
const SINGLETON_BINDING_TYPES = new Set([
	"ai",
	"assets",
	"browser",
	"analytics",
	"images",
	"media",
	"stream",
	"version-metadata",
]);

/**
 * Merges the Worker declared in `cloudflare.config.ts`, already in Miniflare's
 * native shape, into the Worker under test converted from `miniflare` options.
 * `miniflare` options win:
 * - bindings replace the config's with the same name, and a binding of a type a
 *   Worker can only have one of replaces the config's of that type;
 * - exports replace the config's with the same name, except Durable Object
 *   classes the config declares;
 * - queue consumers replace the config's for the same queue;
 * - compatibility flags and tail consumers are added to the config's.
 *
 * The config's remaining secrets and Hyperdrive bindings are then resolved
 * locally. Its assets binding and settings are dropped, unless `miniflare.assets`
 * provides a directory.
 *
 * @param userWorker The Worker under test, converted from `miniflare` options.
 * @param cloudflareConfig The loaded `cloudflare.config.ts`.
 * @param customOptions Whether remote bindings are enabled, and the config's
 *   remote proxy session, if any.
 * @returns The merged Worker under test.
 */
export function mergeCloudflareConfigWorker(
	userWorker: WorkerOptions,
	{ worker, mode, localEnv, devVars }: LoadedNewConfig,
	customOptions: {
		remoteBindings?: boolean;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	}
): WorkerOptions {
	const {
		assets: configAssets,
		compatibilityFlags: configCompatibilityFlags,
		entrypoint: _entrypoint,
		env: configEnv,
		exports: configExports,
		tailConsumers: configTailConsumers,
		triggers: configTriggers,
		...config
	} = worker;
	const userConfig = userWorker.config;
	const userEnv = userConfig.env ?? {};

	const userSingletonTypes = new Set(
		Object.values(userEnv).flatMap((binding) =>
			SINGLETON_BINDING_TYPES.has(binding.type) ? [binding.type] : []
		)
	);
	const remainingConfigEnv: NonNullable<typeof configEnv> = {};
	for (const [name, binding] of Object.entries(configEnv ?? {})) {
		// Without `miniflare.assets`, there's no assets directory to serve
		if (binding.type === "assets" && userConfig.assets === undefined) {
			continue;
		}
		if (!(name in userEnv) && !userSingletonTypes.has(binding.type)) {
			remainingConfigEnv[name] = binding;
		}
	}
	// Only the bindings `miniflare` doesn't replace need local values, so
	// `miniflare` can supply ones that have none, such as Hyperdrive connection
	// strings
	const workerEnv = resolveLocalBindings(remainingConfigEnv, {
		workerName: worker.name,
		localEnv,
		devVars,
		mode,
		remoteBindings: customOptions.remoteBindings,
		logger: log,
	});

	const workerExports: NonNullable<WorkerOptions["config"]["exports"]> = {};
	for (const [name, exported] of Object.entries(configExports ?? {})) {
		// Containers aren't supported by the pool, as for Wrangler configs
		const { container: _container, ...rest } = exported as typeof exported & {
			container?: string;
		};
		workerExports[name] = rest;
	}
	// Binding a Durable Object in `miniflare` options also declares its class,
	// with `legacy-kv` storage unless `useSQLite` is set, so keep the config's
	// declaration of that class
	const userExports = Object.fromEntries(
		Object.entries(userConfig.exports ?? {}).filter(
			([name, exported]) =>
				exported.type !== "durable-object" ||
				workerExports[name]?.type !== "durable-object"
		)
	);

	const userQueueConsumers = new Set(
		(userConfig.triggers ?? []).flatMap((trigger) =>
			trigger.type === "queue" ? [trigger.name] : []
		)
	);
	const workerTriggers = (configTriggers ?? []).filter(
		(trigger) =>
			trigger.type !== "queue" || !userQueueConsumers.has(trigger.name)
	);

	// Miniflare routes all of a Worker's remote bindings through one proxy
	const { remoteProxyConnectionString } = customOptions;
	const userRemoteProxyConnectionString =
		userWorker.dev?.remoteProxyConnectionString;
	if (
		userRemoteProxyConnectionString !== undefined &&
		remoteProxyConnectionString !== undefined &&
		String(userRemoteProxyConnectionString) !==
			String(remoteProxyConnectionString)
	) {
		throw new Error(
			"Remote bindings in `miniflare` options and in `cloudflare.config.ts` use different remote proxy sessions, but a Worker can only use one. Declare the remote bindings in `cloudflare.config.ts` instead."
		);
	}

	return {
		...userWorker,
		config: {
			...config,
			// Converting `miniflare` options sets unused fields to `undefined`
			...withoutUndefined(userConfig),
			compatibilityFlags: [
				...new Set([
					...(configCompatibilityFlags ?? []),
					...(userConfig.compatibilityFlags ?? []),
				]),
			],
			env: { ...workerEnv, ...userEnv },
			exports: { ...workerExports, ...userExports },
			triggers: [...workerTriggers, ...(userConfig.triggers ?? [])],
			tailConsumers: [
				...(configTailConsumers ?? []),
				...(userConfig.tailConsumers ?? []),
			],
			assets:
				userConfig.assets === undefined
					? undefined
					: {
							...userConfig.assets,
							...configAssets,
							...withoutUndefined(userConfig.assets),
						},
		},
		dev: {
			...userWorker.dev,
			zone: userWorker.dev?.zone ?? getWorkerZone(worker),
			remoteProxyConnectionString:
				userRemoteProxyConnectionString ?? remoteProxyConnectionString,
		},
	};
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined)
	) as Partial<T>;
}

/**
 * Gets the zone of the Worker's first route, as Wrangler configs get it. Copied
 * from `@cloudflare/vite-plugin` (`src/miniflare-options.ts`); keep the two in
 * sync.
 *
 * @param config The Worker's domains and triggers.
 * @returns The zone, if the Worker has a route.
 */
function getWorkerZone(
	config: Pick<LoadedNewConfig["worker"], "domains" | "triggers">
): string | undefined {
	// Domains are converted to routes before fetch triggers, so this mirrors the
	// first-route selection used by Wrangler's Miniflare options.
	const domain = config.domains?.[0];
	if (domain !== undefined) {
		return getZoneFromRoute(
			typeof domain === "string" ? domain : domain.hostname
		);
	}

	const fetchTrigger = config.triggers?.find(
		(trigger) => trigger.type === "fetch"
	);
	if (fetchTrigger?.type !== "fetch") {
		return undefined;
	}

	return getZoneFromRoute(
		fetchTrigger.zone?.includes(".")
			? { pattern: fetchTrigger.pattern, zone_name: fetchTrigger.zone }
			: fetchTrigger.pattern
	);
}
