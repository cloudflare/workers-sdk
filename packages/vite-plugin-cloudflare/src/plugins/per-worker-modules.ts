import assert from "node:assert";
import { createPlugin } from "../utils";

const WORKER_MODULE_PREFIX = "cloudflare:workers/";

/**
 * Plugin to resolve `cloudflare:workers/<name>` to `cloudflare:workers` when
 * `<name>` is the Worker being built, and to fail for any other Worker.
 *
 * The check runs on the imports that reach the bundler, so `import type` of
 * another Worker's module is allowed.
 */
export const perWorkerModulesPlugin = createPlugin(
	"per-worker-modules",
	(ctx) => {
		return {
			enforce: "pre",
			applyToEnvironment(environment) {
				return (
					ctx.resolvedPluginConfig.experimental.perWorkerModules === true &&
					ctx.getWorkerConfig(environment.name) !== undefined
				);
			},
			resolveId: {
				filter: { id: /^cloudflare:workers\// },
				handler(source, importer) {
					const workerConfig = ctx.getWorkerConfig(this.environment.name);
					assert(workerConfig, "Expected `workerConfig` to be defined");
					const workerName = source.slice(WORKER_MODULE_PREFIX.length);

					if (workerName !== workerConfig.name) {
						throw new Error(
							`Cannot import "${source}" in the "${workerConfig.name}" Worker${importer ? ` (imported by ${importer})` : ""}. ` +
								`A Worker can only import its own module, "${WORKER_MODULE_PREFIX}${workerConfig.name}". ` +
								`To use another Worker's types, use \`import type\`.`
						);
					}

					return { id: "cloudflare:workers", external: true };
				},
			},
		};
	}
);
