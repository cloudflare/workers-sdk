import type { Context } from "../context";
import type * as vite from "vite";

// virtual modules
export const virtualPrefix = "virtual:cloudflare/";
export const VIRTUAL_USER_ENTRY = `${virtualPrefix}user-entry`;
export const VIRTUAL_NODEJS_COMPAT_ENTRY = `${virtualPrefix}nodejs-compat-entry`;
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
			const workerConfig = ctx.getWorkerConfig(this.environment.name);

			if (!workerConfig) {
				return;
			}

			if (source === VIRTUAL_WORKER_ENTRY) {
				return `\0${VIRTUAL_WORKER_ENTRY}`;
			}

			if (source === VIRTUAL_USER_ENTRY) {
				return this.resolve(workerConfig.main);
			}
		},
		load(id) {
			if (!ctx.getWorkerConfig(this.environment.name)) {
				return;
			}

			if (id === `\0${VIRTUAL_WORKER_ENTRY}`) {
				const entryModule = ctx.getNodeJsCompat(this.environment.name)
					? VIRTUAL_NODEJS_COMPAT_ENTRY
					: VIRTUAL_USER_ENTRY;

				return `
import * as mod from "${entryModule}";
export * from "${entryModule}";
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
