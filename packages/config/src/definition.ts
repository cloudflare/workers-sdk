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

/** Create a type-safe identity helper for a configuration value or factory. */
export function createConfigDefiner<TConfig>() {
	return function define<const TInput extends ConfigInput<TConfig>>(
		config: TInput
	): TInput {
		return config;
	};
}

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
export const defineConfig = createConfigDefiner<CloudflareConfig>();

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
export const defineContainer = createConfigDefiner<ContainerConfig>();

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
export const defineWorker = createConfigDefiner<WorkerConfig>();
