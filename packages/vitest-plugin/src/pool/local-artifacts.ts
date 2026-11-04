import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type { Config } from "@cloudflare/workers-utils";

// Tests should not create, push to or delete real repositories by accident, so
// Workers Vitest uses the local Artifacts simulator unless a binding opts into
// the deployed resource with `remote: true`. Wrangler and Vite default to the
// deployed resource instead, with a warning.
//
// Making the omitted setting explicit before anything else reads the config
// keeps the remote proxy session, the default-remote warning and Miniflare's
// routing in agreement.

/**
 * Sets `dev.remote: false` on `cloudflare.config.ts` Artifacts bindings that
 * omit it.
 *
 * @param env The Worker's configured bindings.
 * @returns The bindings, with every Artifacts binding's `dev.remote` set.
 */
export function defaultNewConfigArtifactsToLocal(
	env: ParsedInputWorkerConfig["env"]
): ParsedInputWorkerConfig["env"] {
	if (env === undefined) {
		return env;
	}
	return Object.fromEntries(
		Object.entries(env).map(([name, binding]) => [
			name,
			binding.type === "artifacts" && binding.dev?.remote === undefined
				? { ...binding, dev: { ...binding.dev, remote: false } }
				: binding,
		])
	);
}

/**
 * Sets `remote: false` on Wrangler config Artifacts bindings that omit it.
 *
 * @param config The parsed Wrangler config.
 * @returns The config, with every Artifacts binding's `remote` set.
 */
export function defaultWranglerConfigArtifactsToLocal(config: Config): Config {
	if (config.artifacts.every((binding) => binding.remote !== undefined)) {
		return config;
	}
	return {
		...config,
		artifacts: config.artifacts.map((binding) => ({
			...binding,
			remote: binding.remote ?? false,
		})),
	};
}
