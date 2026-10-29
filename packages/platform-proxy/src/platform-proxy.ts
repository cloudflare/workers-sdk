import path from "node:path";
import { Miniflare } from "miniflare";
import { CacheStorage } from "./caches";
import { ExecutionContext } from "./execution-context";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type { WorkerOptions } from "miniflare";

type MiniflareEnv = NonNullable<WorkerOptions["config"]["env"]>;

/** Options for how the platform proxy emulates the bindings */
export type PlatformProxyOptions = {
	/**
	 * Whether and where to persist the bindings' data. Defaults to `.cloudflare/state` in the
	 * project directory, which the Cloudflare Vite plugin also uses, so both see the same data.
	 */
	persist?: boolean | { path: string };
};

/** The emulated platform returned by `getPlatformProxy()` */
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
	/** Stand-in for the Workers `caches` global; it caches nothing */
	caches: CacheStorage;
	/** Stops the process that provides the bindings */
	dispose: () => Promise<void>;
};

/**
 * Emulates a Worker's bindings with Miniflare.
 *
 * @param worker The Worker configuration from `cloudflare.config.ts`
 * @param root The project directory, which persisted data is stored relative to
 * @param options How to emulate the bindings
 * @returns The emulated platform
 */
export async function startPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = Record<string, unknown>,
>(
	worker: ParsedInputWorkerConfig,
	root: string,
	options: PlatformProxyOptions = {}
): Promise<PlatformProxy<Env, CfProperties>> {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: worker.name,
					compatibilityDate: worker.compatibilityDate,
					compatibilityFlags: worker.compatibilityFlags,
					env: getEmulatedBindings(worker),
					// The proxy only provides bindings, so it runs none of the Worker's own code
					manifest: {
						mainModule: "index.mjs",
						modules: {
							"index.mjs": { type: "esm", contents: "export default {};" },
						},
					},
				},
				// Keep the empty Worker out of the dev registry, where it would shadow the real one
				dev: { unsafeRegisterWorker: false },
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

	let env: Env;
	let cf: Record<string, unknown>;
	try {
		env = await mf.getBindings<Env>();
		cf = await mf.getCf();
	} catch (error) {
		await mf.dispose();
		throw error;
	}
	deepFreeze(cf);

	return {
		env,
		cf: cf as CfProperties,
		ctx: new ExecutionContext(),
		caches: new CacheStorage(),
		dispose: () => mf.dispose(),
	};
}

/**
 * Picks the bindings the proxy can emulate, and warns about the ones it leaves out.
 *
 * @param worker The Worker configuration from `cloudflare.config.ts`
 * @returns The bindings to emulate
 */
function getEmulatedBindings(worker: ParsedInputWorkerConfig): MiniflareEnv {
	const env: MiniflareEnv = {};

	for (const [name, binding] of Object.entries(worker.env ?? {})) {
		let unsupported: string | undefined;
		if (binding.type === "secret") {
			unsupported = "secrets aren't supported yet";
		} else if (binding.type === "assets") {
			unsupported = "the assets binding isn't supported yet";
		} else if (isRemoteBinding(binding)) {
			unsupported = "remote bindings aren't supported yet";
		} else if (
			(binding.type === "durable-object" ||
				binding.type === "workflow" ||
				binding.type === "worker") &&
			binding.worker === worker.name
		) {
			unsupported =
				"it refers to this Worker's own code, which the platform proxy doesn't run";
		} else if (binding.type === "hyperdrive") {
			// The same override the Cloudflare Vite plugin and Wrangler read
			const connectionString =
				process.env[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${name}`] ||
				binding.dev?.connectionString;
			if (connectionString === undefined) {
				unsupported = "it needs `dev.connectionString` for local development";
			} else {
				env[name] = { ...binding, dev: { ...binding.dev, connectionString } };
				continue;
			}
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
 * Checks whether a binding is configured to use the remote resource in local development.
 *
 * @param binding A binding from `cloudflare.config.ts`
 * @returns Whether the binding sets `dev.remote`
 */
function isRemoteBinding(binding: object): boolean {
	return (
		"dev" in binding &&
		typeof binding.dev === "object" &&
		binding.dev !== null &&
		"remote" in binding.dev &&
		binding.dev.remote === true
	);
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
