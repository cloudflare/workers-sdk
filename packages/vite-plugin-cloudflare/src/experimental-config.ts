/**
 * Experimental entry point that re-exports config-authoring utilities from
 * `@cloudflare/config`. Enabled by setting `experimental.newConfig: true` on
 * the plugin and authoring a `worker.config.ts` in the project root.
 */

export { bindings, createBindings, defineConfig } from "@cloudflare/config";
export type {
	Bindings,
	Config,
	InferDurableNamespaces,
	InferEnv,
	InferMainModule,
	UnwrapConfig,
} from "@cloudflare/config";

declare module "@cloudflare/config" {
	interface ConfigContext {
		/**
		 * The Vite [`mode`](https://vite.dev/guide/env-and-mode.html#modes) the
		 * config is being evaluated in (e.g. `"development"`, `"production"`).
		 */
		mode: string;
	}
}
