import path from "node:path";
import { getRemoteBindingsAuth } from "./auth";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./execution-context";
import type {
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
} from "@cloudflare/config";
import type { RemoteBindingsLogger } from "@cloudflare/remote-bindings";

const remoteBindingsLogger: RemoteBindingsLogger = {
	loggerLevel: "log",
	debug: console.debug,
	log: console.log,
	info: console.info,
	warn: console.warn,
	error: console.error,
	console(method, ...args) {
		Reflect.apply(console[method], console, args);
	},
};

/** The platform returned by `getPlatformProxy()` */
export type PlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = Record<string, unknown>,
> = {
	/** The Worker's bindings */
	env: Env;
	/** The `cf` properties of an incoming request */
	cf: CfProperties;
	/** Stand-in for the `ctx` object a Worker receives; its methods do nothing */
	ctx: ExecutionContext;
	/**
	 * The Workers `caches` global. When the proxy starts its own runtime, it's a
	 * stand-in that caches nothing.
	 */
	caches: CacheStorage;
	/** Stops the runtime the proxy started, or disconnects from the one it attached to */
	dispose: () => Promise<void>;
};

/**
 * Emulates a Worker's bindings with Miniflare.
 *
 * @param worker The Worker configuration from `cloudflare.config.ts`
 * @param root The project directory, which persisted data and local values are read relative to
 * @param options Whether and where to persist the bindings' data, the mode to read local values
 * for, the account settings, and whether to connect remote bindings
 * @returns The emulated platform
 */
export async function startPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = Record<string, unknown>,
>(
	worker: ParsedInputWorkerConfig,
	root: string,
	options: {
		persist?: boolean | { path: string };
		mode?: string;
		settings?: ParsedInputSettingsConfig;
		remoteBindings?: boolean;
	} = {}
): Promise<PlatformProxy<Env, CfProperties>> {
	const { mode = "development", remoteBindings = true } = options;
	const [{ Miniflare, resolveLocalBindings }, { loadDevVars, loadEnv }] =
		await Promise.all([
			import("miniflare"),
			import("@cloudflare/workers-utils/local-env"),
		]);
	// Secrets come from the same files as in the Cloudflare Vite plugin
	const [localEnv, devVars] = await Promise.all([
		loadEnv(root, mode),
		loadDevVars(root, mode),
	]);
	const bindings = resolveLocalBindings(
		getEmulatedBindings(worker, localEnv.values, remoteBindings),
		{
			workerName: worker.name,
			localEnv: localEnv.values,
			devVars,
			mode,
			remoteBindings,
			logger: console,
		}
	);
	const remoteProxySession = remoteBindings
		? await startRemoteBindingsSession(worker, root, options.settings)
		: null;

	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: worker.name,
					compatibilityDate: worker.compatibilityDate,
					compatibilityFlags: worker.compatibilityFlags,
					env: bindings,
					// The proxy only provides bindings, so it runs none of the Worker's own code
					manifest: {
						mainModule: "index.mjs",
						modules: {
							"index.mjs": { type: "esm", contents: "export default {};" },
						},
					},
				},
				dev: {
					// Keep the empty Worker out of the dev registry, where it would shadow the real one
					unsafeRegisterWorker: false,
					remoteProxyConnectionString:
						remoteProxySession?.session.remoteProxyConnectionString,
				},
			},
		],
		// Matches the Cloudflare Vite plugin's `getPersistenceRoot()`, so both share the same data
		resourcePersistencePath:
			options.persist === false
				? undefined
				: path.resolve(
						root,
						typeof options.persist === "object"
							? options.persist.path
							: ".cloudflare/state",
						"v3"
					),
	});
	const dispose = async () => {
		await mf.dispose();
		await remoteProxySession?.session.dispose();
	};

	let env: Env;
	let cf: Record<string, unknown>;
	try {
		env = await mf.getBindings<Env>();
		cf = await mf.getCf();
	} catch (error) {
		await dispose();
		throw error;
	}
	deepFreeze(cf);

	return {
		env,
		cf: cf as CfProperties,
		ctx: new ExecutionContext(),
		caches: new CacheStorage(),
		dispose,
	};
}

/**
 * Starts a session for the Worker's remote bindings, if it has any, with cf's credentials.
 *
 * @param worker The Worker configuration from `cloudflare.config.ts`
 * @param root The project directory, which the cf auth profile is resolved from
 * @param settings The account settings from `cloudflare.config.ts`
 * @returns The session, or `null` if the Worker has no remote bindings
 */
async function startRemoteBindingsSession(
	worker: ParsedInputWorkerConfig,
	root: string,
	settings: ParsedInputSettingsConfig | undefined
) {
	const { maybeStartOrUpdateRemoteProxySession } =
		await import("@cloudflare/remote-bindings");
	return maybeStartOrUpdateRemoteProxySession(
		{
			name: worker.name,
			target: "cf",
			env: worker.env ?? {},
			complianceRegion:
				settings?.complianceRegion === "fedramp-high"
					? "fedramp_high"
					: settings?.complianceRegion,
		},
		null,
		getRemoteBindingsAuth(root, settings?.accountId, remoteBindingsLogger),
		{ cliDisplayName: "cf", logger: remoteBindingsLogger }
	);
}

/**
 * Picks the bindings the proxy can emulate, and warns about the ones it leaves out.
 *
 * @param worker The Worker configuration from `cloudflare.config.ts`
 * @param localEnv Values from `.env` files and the process environment
 * @param remoteBindings Whether remote bindings connect to the real resources
 * @returns The bindings to emulate
 */
function getEmulatedBindings(
	worker: ParsedInputWorkerConfig,
	localEnv: Record<string, string>,
	remoteBindings: boolean
): NonNullable<ParsedInputWorkerConfig["env"]> {
	const env: NonNullable<ParsedInputWorkerConfig["env"]> = {};

	for (const [name, binding] of Object.entries(worker.env ?? {})) {
		let unsupported: string | undefined;
		if (binding.type === "assets") {
			unsupported = "the assets binding isn't supported yet";
		} else if (
			(binding.type === "durable-object" ||
				binding.type === "workflow" ||
				binding.type === "worker") &&
			binding.worker === worker.name
		) {
			unsupported =
				"it refers to this Worker's own code, which the platform proxy doesn't run";
		} else if (
			binding.type === "hyperdrive" &&
			!(remoteBindings && binding.dev?.remote) &&
			// The same override the Cloudflare Vite plugin and Wrangler read
			!localEnv[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${name}`] &&
			binding.dev?.connectionString === undefined
		) {
			unsupported = `it needs \`dev.connectionString\` or the \`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${name}\` environment variable for local development`;
		} else {
			env[name] = binding;
			continue;
		}

		console.warn(
			`The platform proxy leaves out the \`${name}\` binding: ${unsupported}.`
		);
	}

	return env;
}

/**
 * Freezes an object and every object it contains.
 *
 * @param obj The object to freeze
 */
function deepFreeze(obj: Record<string | number | symbol, unknown>): void {
	Object.freeze(obj);
	for (const value of Object.values(obj)) {
		if (
			value !== null &&
			typeof value === "object" &&
			!Object.isFrozen(value)
		) {
			deepFreeze(value as Record<string | number | symbol, unknown>);
		}
	}
}
