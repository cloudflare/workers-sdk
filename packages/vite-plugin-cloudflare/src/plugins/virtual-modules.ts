import type { Context } from "../context";
import type * as vite from "vite";

const virtualPrefix = "virtual:cloudflare/";
const VIRTUAL_USER_ENTRY = `${virtualPrefix}user-entry`;
export const VIRTUAL_WORKER_ENTRY = `${virtualPrefix}worker-entry`;
export const VIRTUAL_CLIENT_FALLBACK_ENTRY = `${virtualPrefix}client-fallback-entry`;

/**
 * Plugin to provide virtual modules
 */
export function virtualModules(ctx: Context): vite.Plugin {
	return {
		name: "vite-plugin-cloudflare:virtual-modules",
		applyToEnvironment(environment) {
			return ctx.getWorkerConfig(environment.name) !== undefined;
		},
		resolveId(source) {
			if (source === VIRTUAL_WORKER_ENTRY) {
				return `\0${VIRTUAL_WORKER_ENTRY}`;
			}

			if (source === VIRTUAL_USER_ENTRY) {
				const workerConfig = ctx.getWorkerConfig(this.environment.name);

				if (!workerConfig) {
					return;
				}

				return this.resolve(workerConfig.main);
			}
		},
		load(id) {
			if (id === `\0${VIRTUAL_WORKER_ENTRY}`) {
				const nodeJsCompat = ctx.getNodeJsCompat(this.environment.name);

				return `
${nodeJsCompat ? nodeJsCompat.injectGlobalCode() : ""}
import * as mod from "${VIRTUAL_USER_ENTRY}";
export * from "${VIRTUAL_USER_ENTRY}";
export default mod.default ?? {};
if (import.meta.hot) {
	import.meta.hot.accept();
}
					`;
			}
		},
	};
}

/**
 * Plugin to provide a client fallback entry file.
 * This is used to trigger as the entry file for the client build when only the `public` directory is present.
 */
export function virtualClientFallback(): vite.Plugin {
	// Plugin to provide a fallback entry file
	return {
		name: "vite-plugin-cloudflare:client-fallback-entry",
		applyToEnvironment(environment) {
			return environment.name === "client";
		},
		resolveId(source) {
			if (source === VIRTUAL_CLIENT_FALLBACK_ENTRY) {
				return `\0${VIRTUAL_CLIENT_FALLBACK_ENTRY}`;
			}
		},
		load(id) {
			if (id === `\0${VIRTUAL_CLIENT_FALLBACK_ENTRY}`) {
				return ``;
			}
		},
	};
}
