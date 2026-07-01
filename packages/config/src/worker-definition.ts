import type {
	Bindings,
	TypedDurableObjectBinding,
	TypedWorkerBinding,
} from "./bindings";
import type {
	InferWorkerName,
	InferExportsByType,
	InferWorkerEntrypointExports,
} from "./inference";
import type { UserConfig } from "./types";

// TODO: Use declaration merging in the consuming package once this package is published
export interface ConfigContext {
	/**
	 * The mode the config is being evaluated in.
	 * Set via the `--mode` CLI flag.
	 * In Vite the mode defaults to `development` in `vite dev` and `production` in `vite build` ([more info](https://vite.dev/guide/env-and-mode.html#modes)).
	 * In Wrangler the mode defaults to `undefined`.
	 */
	mode: string | undefined;
}

// We currently use Symbol.for rather than Symbol so that the symbol matches if duplicated across bundles
// This wouldn't be necessary if @cloudflare/config was published and included as a dependency
const CONFIG = Symbol.for("@cloudflare/config:worker-config");

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
		TExportName extends InferWorkerEntrypointExports<TConfig> | undefined =
			undefined,
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

export type UserConfigExport<T extends UserConfig = UserConfig> =
	| T
	| Promise<T>
	| ((ctx: ConfigContext) => T | Promise<T>);

export function defineWorker<const T extends UserConfig>(
	config: (ctx: ConfigContext) => (UserConfig & T) | Promise<UserConfig & T>
): TypedWorkerDefinition<T>;
export function defineWorker<const T extends UserConfig>(
	config: (UserConfig & T) | Promise<UserConfig & T>
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
		// 	return { type: "workflow", ...options };
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
