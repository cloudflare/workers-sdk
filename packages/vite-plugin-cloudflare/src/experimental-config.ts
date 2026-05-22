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
