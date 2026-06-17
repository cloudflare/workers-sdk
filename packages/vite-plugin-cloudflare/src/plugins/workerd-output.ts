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
	let outDir = "dist";

	return {
		config(userConfig) {
			if (userConfig.build?.outDir) {
				outDir = userConfig.build.outDir;
			}
		},
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

				const workerdOutDir = path.resolve(
					ctx.resolvedViteConfig.root,
					outDir,
					"workerd"
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
					const modules = getPreviewModules(main, modulesRules);
					workers.push(
						{
							...options,
							...modules,
							modulesRoot: modules.rootPath,
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
					defaultPersistRoot: path.join(workerdOutDir, ".workerd", "state"),
					workers,
				});
				fs.mkdirSync(workerdOutDir, { recursive: true });
				fs.writeFileSync(
					path.join(workerdOutDir, "config.bin"),
					serializeConfig(config)
				);
			},
		},
	};
});
