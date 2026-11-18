import type { CloudflareConfig, ContainerConfig, WorkerConfig } from "./types";

export interface ConfigContext {
	/** Whether the config is being evaluated for a Preview build. */
	isPreview: boolean;

	/**
	 * The mode the config is being evaluated in.
	 * Set via the `--mode` CLI flag.
	 * In Vite the mode defaults to `development` in `vite dev` and `production` in `vite build` ([more info](https://vite.dev/guide/env-and-mode.html#modes)).
	 * In Wrangler the mode defaults to `undefined`.
	 */
	mode: string | undefined;
}

/**
 * A configuration value, promise, or factory. Factories can be passed directly
 * for automatic resolution with the current context or called explicitly with
 * another context before they are used.
 */
export type ConfigInput<T> =
	| T
	| Promise<T>
	| ((ctx: ConfigContext) => T | Promise<T>);

/** Recursively apply declared config properties without expanding open records. */
type ContextualProperties<
	TInput extends object,
	TConfig,
> = TInput extends readonly unknown[]
	? TConfig extends readonly (infer TElement)[]
		? {
				[K in keyof TInput]: ContextualConfig<TInput[K], TElement>;
			}
		: TConfig
	: string extends keyof TConfig
		? TConfig
		: {
				[K in keyof TConfig]: K extends keyof TInput
					? ContextualConfig<TInput[K], TConfig[K]>
					: TConfig[K];
			};

type ContextualConfig<TInput, TConfig> =
	TInput extends Promise<infer TValue>
		? Promise<ContextualConfig<TValue, TConfig>>
		: TInput extends (ctx: ConfigContext) => infer TResult
			? (ctx: ConfigContext) => ContextualConfig<TResult, TConfig>
			: TConfig extends unknown
				? TInput extends TConfig
					? TInput &
							(TInput extends object
								? ContextualProperties<TInput, TConfig>
								: TConfig)
					: never
				: never;

export type ContainerDefinition<T extends ContainerConfig = ContainerConfig> =
	ConfigInput<T>;

export type WorkerDefinition<T extends WorkerConfig = WorkerConfig> =
	ConfigInput<T>;

/** A Worker name, value, promise, or context-aware factory. */
export type WorkerReference = string | WorkerDefinition;

/**
 * Used to define the default export in `cloudflare.config.ts`.
 *
 * @example
 * ```typescript
 * import { defineConfig } from "@cloudflare/config";
 *
 * export default defineConfig({
 *   worker: {
 *     name: "my-worker",
 *     compatibilityDate: "2026-09-17",
 *   },
 * });
 * ```
 */
export function defineConfig<
	const TInput extends ConfigInput<CloudflareConfig>,
>(config: TInput & ContextualConfig<TInput, CloudflareConfig>): TInput {
	return config;
}

/**
 * Define a Container.
 *
 * @example
 * ```typescript
 * import { defineContainer } from "@cloudflare/config";
 *
 * const container = defineContainer({
 *   name: "my-container",
 *   image: { dockerfile: "./Dockerfile" },
 * });
 * ```
 */
export function defineContainer<
	const TInput extends ConfigInput<ContainerConfig>,
>(config: TInput & ContextualConfig<TInput, ContainerConfig>): TInput {
	return config;
}

/**
 * Define a Worker.
 *
 * @example
 * ```typescript
 * import { defineWorker } from "@cloudflare/config";
 *
 * const worker = defineWorker({
 *   name: "my-worker",
 *   compatibilityDate: "2026-09-17",
 * });
 * ```
 */
export function defineWorker<const TInput extends ConfigInput<WorkerConfig>>(
	config: TInput & ContextualConfig<TInput, WorkerConfig>
): TInput {
	return config;
}
