import type {
	Bindings,
	TypedDurableObjectBinding,
	TypedWorkerBinding,
} from "./bindings";
import type {
	InferWorkerName,
	InferExportsByType,
	InferEntrypointExports,
} from "./inference";
import type { UserConfig } from "./types";

// TODO: Use declaration merging in the consuming package once this package is published
export interface ConfigContext {
	/**
	 * The Vite [`mode`](https://vite.dev/guide/env-and-mode.html#modes) the
	 * config is being evaluated in (e.g. `"development"`, `"production"`).
	 */
	mode: string;
}

const CONFIG: unique symbol = Symbol();

/**
 * Base shape of a Worker definition. Carries the resolved config and the
 * untyped cross-worker binding helpers.
 */
export interface WorkerDefinition<
	TConfig extends UserConfig = UserConfig,
> extends Pick<Bindings, "durableObject" | "worker"> {
	[CONFIG]:
		| TConfig
		| Promise<TConfig>
		| ((ctx: ConfigContext) => TConfig | Promise<TConfig>);
}

/**
 * Worker definition with typed cross-worker binding helpers.
 */
export interface TypedWorkerDefinition<
	TConfig extends UserConfig,
	TWorkerName extends string = InferWorkerName<TConfig>,
> extends WorkerDefinition<TConfig> {
	/**
	 * Binding to a Durable Object class. `workerName` is the name of the Worker
	 * that defines the class; `exportName` is the exported class name.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
	 */
	durableObject<
		TExportName extends InferExportsByType<TConfig, "durable-object">,
	>(options: {
		workerName: TWorkerName;
		exportName: TExportName;
	}): TypedDurableObjectBinding<TConfig, TExportName>;
	/**
	 * Service binding (Worker-to-Worker). `workerName` is the name of the bound
	 * Worker; `exportName` selects a named `WorkerEntrypoint` export (defaults to
	 * the default export).
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
	 */
	worker<
		TExportName extends InferEntrypointExports<TConfig> | undefined = undefined,
	>(options: {
		workerName: TWorkerName;
		exportName?: TExportName;
		props?: Record<string, unknown>;
		remote?: boolean;
	}): TypedWorkerBinding<
		TConfig,
		TExportName extends string ? TExportName : "default"
	>;
	// TODO: re-enable when workflow bindings return.
	// workflow<
	// 	TExportName extends InferExportsByType<TConfig, "workflow">,
	// >(options: {
	// 	workerName: TWorkerName;
	// 	exportName: TExportName;
	// 	remote?: boolean;
	// }): TypedWorkflowBinding<TConfig, TExportName>;
}

type UserConfigFnObject = (ctx: ConfigContext) => UserConfig;
type UserConfigFnPromise = (ctx: ConfigContext) => Promise<UserConfig>;
type UserConfigFn = (ctx: ConfigContext) => UserConfig | Promise<UserConfig>;

export type UserConfigExport =
	| UserConfig
	| Promise<UserConfig>
	| UserConfigFnObject
	| UserConfigFnPromise
	| UserConfigFn;

export function defineWorker<const T extends UserConfig>(
	config: UserConfig & T
): TypedWorkerDefinition<T>;
export function defineWorker<const T extends UserConfig>(
	config: Promise<UserConfig & T>
): TypedWorkerDefinition<T>;
export function defineWorker<const T extends UserConfig>(
	config: (ctx: ConfigContext) => UserConfig & T
): TypedWorkerDefinition<T>;
export function defineWorker<const T extends UserConfig>(
	config: (ctx: ConfigContext) => Promise<UserConfig & T>
): TypedWorkerDefinition<T>;
export function defineWorker(config: UserConfigExport): WorkerDefinition {
	return {
		[CONFIG]: config,
		durableObject(options) {
			return { type: "durable-object", ...options };
		},
		worker(options) {
			return { type: "worker", ...options };
		},
		// TODO: re-enable when workflow bindings return.
		// workflow(options) {
		// 	return options;
		// },
	};
}

export async function resolveWorkerDefinition(
	def: unknown,
	ctx: ConfigContext
): Promise<unknown> {
	const raw =
		typeof def === "object" && def !== null && CONFIG in def
			? (def as Record<symbol, unknown>)[CONFIG]
			: def;

	const value =
		typeof raw === "function"
			? (raw as (ctx: ConfigContext) => unknown)(ctx)
			: raw;

	return await value;
}
