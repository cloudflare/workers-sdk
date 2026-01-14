import assert from "node:assert";
import {
	VIRTUAL_EXPORT_TYPES,
	VIRTUAL_WORKER_ENTRY,
	virtualPrefix,
} from "../shared";
import { createPlugin } from "../utils";

export const VIRTUAL_USER_ENTRY = `${virtualPrefix}user-entry`;
export const VIRTUAL_CLIENT_FALLBACK_ENTRY = `${virtualPrefix}client-fallback-entry`;

/**
 * Plugin to provide virtual modules
 */
export const virtualModulesPlugin = createPlugin("virtual-modules", (ctx) => {
	return {
		applyToEnvironment(environment) {
			return (
				!ctx.isChildEnvironment(environment.name) &&
				ctx.getWorkerConfig(environment.name) !== undefined
			);
		},
		async resolveId(source) {
			if (source === VIRTUAL_WORKER_ENTRY || source === VIRTUAL_EXPORT_TYPES) {
				return `\0${source}`;
			}

			if (source === VIRTUAL_USER_ENTRY) {
				const workerConfig = ctx.getWorkerConfig(this.environment.name);
				assert(workerConfig, "Expected `workerConfig` to be defined");
				const main = await this.resolve(workerConfig.main);
				if (!main) {
					throw new Error(
						`Failed to resolve main entry file "${workerConfig.main}" for environment "${this.environment.name}"`
					);
				}
				return main;
			}
		},
		load(id) {
			if (id === `\0${VIRTUAL_WORKER_ENTRY}`) {
				const nodeJsCompat = ctx.getNodeJsCompat(this.environment.name);

				return `
${nodeJsCompat ? nodeJsCompat.injectGlobalCode() : ""}
import { getExportTypes } from "${VIRTUAL_EXPORT_TYPES}";
import * as mod from "${VIRTUAL_USER_ENTRY}";
export * from "${VIRTUAL_USER_ENTRY}";
export default mod.default ?? {};
if (import.meta.hot) {
	import.meta.hot.accept((module) => {
		const exportTypes = getExportTypes(module);
		import.meta.hot.send("vite-plugin-cloudflare:worker-export-types", exportTypes);
	});
}
				`;
			}

			if (id === `\0${VIRTUAL_EXPORT_TYPES}`) {
				return `
import {
	WorkerEntrypoint,
	DurableObject,
	WorkflowEntrypoint,
} from "cloudflare:workers";

const baseClasses = new Map([
	["WorkerEntrypoint", WorkerEntrypoint],
	["DurableObject", DurableObject],
	["WorkflowEntrypoint", WorkflowEntrypoint],
]);

export function getExportTypes(module) {
	const exportTypes = {};

	for (const [key, value] of Object.entries(module)) {
		if (key === "default") {
			continue;
		}

		let exportType;

		if (typeof value === "function") {
			for (const [type, baseClass] of baseClasses) {
				if (baseClass.prototype.isPrototypeOf(value.prototype)) {
					exportType = type;
					break;
				}
			}

			if (!exportType) {
				exportType = "DurableObject";
			}
		} else if (typeof value === "object" && value !== null) {
			exportType = "WorkerEntrypoint";
		}

		exportTypes[key] = exportType;
	}

	return exportTypes;
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
