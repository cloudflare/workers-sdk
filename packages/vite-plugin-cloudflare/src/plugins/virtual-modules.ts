import { createPlugin } from "./utils";

const virtualPrefix = "virtual:cloudflare/";
const VIRTUAL_USER_ENTRY = `${virtualPrefix}user-entry`;
export const VIRTUAL_WORKER_ENTRY = `${virtualPrefix}worker-entry`;
export const VIRTUAL_CLIENT_FALLBACK_ENTRY = `${virtualPrefix}client-fallback-entry`;

/**
 * Plugin to provide virtual modules
 */
export const virtualModulesPlugin = createPlugin("virtual-modules", (ctx) => {
	return {
		applyToEnvironment(environment) {
			return ctx.getWorkerConfig(environment.name) !== undefined;
		},
		resolveId(source) {
			if (source === VIRTUAL_WORKER_ENTRY) {
				return `\0${VIRTUAL_WORKER_ENTRY}`;
			}

			if (source === VIRTUAL_USER_ENTRY) {
				const workerConfig = ctx.getWorkerConfig(this.environment.name);

				// TODO: replace with `assert` once we have migrated to tsdown
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
});

/**
 * Plugin to provide a virtual fallback entry file for the `client` environment.
 * This is used as the entry file for the client build when only the `public` directory is present.
 */
export const virtualClientFallbackPlugin = createPlugin(
	"virtual-client-fallback",
	() => {
		return {
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
);
