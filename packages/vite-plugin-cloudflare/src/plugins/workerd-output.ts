import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	Log,
	LogLevel,
	serializeConfig,
	unstable_assembleWorkerdConfig,
} from "miniflare";
import * as wrangler from "wrangler";
import { getWorkerConfigs } from "../deploy-config";
import { getPreviewModules } from "../miniflare-options";
import { createPlugin } from "../utils";
import type { WorkerOptions } from "miniflare";

export const workerdOutputPlugin = createPlugin("workerd-output", (ctx) => {
	return {
		buildApp: {
			order: "post",
			async handler() {
				const resolvedPluginConfig = ctx.resolvedPluginConfig;
				if (
					resolvedPluginConfig.type !== "workers" ||
					resolvedPluginConfig.target !== "workerd"
				) {
					return;
				}

				const entryEnvironment =
					ctx.resolvedViteConfig.environments[
						resolvedPluginConfig.entryWorkerEnvironmentName
					];
				assert(entryEnvironment, "Expected entry Worker environment");
				const outDir = path.resolve(
					ctx.resolvedViteConfig.root,
					entryEnvironment.build.outDir
				);
				const workers: WorkerOptions[] = [];
				for (const workerConfig of getWorkerConfigs(
					ctx.resolvedViteConfig.root,
					false
				)) {
					const { workerOptions, main, externalWorkers } =
						wrangler.unstable_getMiniflareWorkerOptions(workerConfig);
					const { modulesRules, ...options } = workerOptions;
					assert(main, "Expected built Worker entrypoint");
					workers.push(
						{
							...options,
							...getPreviewModules(main, modulesRules),
							name: options.name ?? workerConfig.name,
							cache: false,
							unsafeUseModuleFallbackService: false,
						},
						...externalWorkers
					);
				}

				const config = await unstable_assembleWorkerdConfig({
					log: new Log(LogLevel.WARN),
					unsafeWorkerdOutput: true,
					defaultPersistRoot: path.join(outDir, ".workerd", "state"),
					workers,
				});
				fs.writeFileSync(
					path.join(outDir, "config.bin"),
					serializeConfig(config)
				);
			},
		},
	};
});
