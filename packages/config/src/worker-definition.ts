import { DEFINITION } from "./definition";
import type {
	Bindings,
	TypedDurableObjectBinding,
	TypedWorkerBinding,
} from "./bindings";
import type { ConfigContext, ConfigInput } from "./definition";
import type {
	InferDurableNamespaces,
	InferWorkerName,
	InferWorkerEntrypointExports,
} from "./inference";
import type { WorkerConfig } from "./types";

/**
 * Base shape of a Worker definition. Carries the authored config (under
 * {@link DEFINITION}) and the untyped cross-worker binding helpers.
 */
export interface WorkerDefinition<
	TConfig extends WorkerConfig = WorkerConfig,
> extends Pick<Bindings, "durableObject" | "worker"> {
	// The authored config is stored without its `type` discriminant (the helper
	// omits it); `type` sits alongside it and is stamped back on during
	// resolution. `TConfig` is still referenced so `UnwrapConfig` can recover it.
	[DEFINITION]: { config: ConfigInput<Omit<TConfig, "type">>; type: "worker" };
}

/**
 * Worker definition with typed cross-worker binding helpers.
 */
export interface TypedWorkerDefinition<
	TConfig extends WorkerConfig,
	TWorkerName extends string = InferWorkerName<TConfig>,
> extends WorkerDefinition<TConfig> {
	/**
	 * Binding to a Durable Object class. `workerName` is the name of the Worker
	 * that defines the class; `exportName` is the exported class name.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
	 */
	durableObject<TExportName extends InferDurableNamespaces<TConfig>>(options: {
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

export type WorkerConfigExport<T extends WorkerConfig = WorkerConfig> =
	ConfigInput<T>;

/**
 * Authored Worker config shape — {@link WorkerConfig} without the `type`
 * discriminant, which `defineWorker` injects.
 */
export type WorkerConfigInput = Omit<WorkerConfig, "type">;

export type WorkerConfigInputExport<
	T extends WorkerConfigInput = WorkerConfigInput,
> = ConfigInput<T>;

export function defineWorker<const T extends WorkerConfigInput>(
	config: (
		ctx: ConfigContext
	) => (WorkerConfigInput & T) | Promise<WorkerConfigInput & T>
): TypedWorkerDefinition<T & { type: "worker" }>;
export function defineWorker<const T extends WorkerConfigInput>(
	config: (WorkerConfigInput & T) | Promise<WorkerConfigInput & T>
): TypedWorkerDefinition<T & { type: "worker" }>;
export function defineWorker(
	config: WorkerConfigInputExport
): WorkerDefinition {
	return {
		[DEFINITION]: { config, type: "worker" },
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
