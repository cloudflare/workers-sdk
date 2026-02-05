import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { createPlugin, debuglog } from "../utils";
import { assertIsNotPreview } from "../context";


const execFile = promisify(execFileCb);
const DEFAULT_WORKERS_TYPES_FILE_NAME = "worker-configuration.d.ts";
const DEFAULT_DEBOUNCE_MS = 100;

export const typesPlugin = createPlugin("types", (ctx) => {
	return {
		async configureServer(viteDevServer) {
			assertIsNotPreview(ctx);

			const dts = ctx.resolvedPluginConfig.dts;
			if (!dts) {
				return;
			}

			const root = ctx.resolvedViteConfig.root;
			const outputPath = path.resolve(
				root,
				typeof dts === "string" ? dts : DEFAULT_WORKERS_TYPES_FILE_NAME
			);

			let debounceTimer: ReturnType<typeof setTimeout> | undefined;
			let running = false;

			async function generateTypes() {
				if (running) {
					return;
				}
				running = true;
				try {
					debuglog(`Generating types at ${outputPath}`);
					let configArg: string | undefined;
					if (ctx.resolvedPluginConfig.type === "workers") {
						const entryWorkerConfigPath = ctx.resolvedPluginConfig.rawConfigs?.entryWorker?.config?.configPath;
						configArg = entryWorkerConfigPath;
					}

					if (!configArg) {
						const firstIter = (ctx.resolvedPluginConfig as { configPaths: Set<string> }).configPaths.values().next();
						if (!firstIter.done) {
							configArg = firstIter.value;
						}
					}

					const args = configArg
						? ["types", outputPath, "--config", path.resolve(root, configArg)]
						: ["types", outputPath];

					await execFile("wrangler", args, { cwd: root });
					debuglog(`Types generated at ${outputPath}`);
				} catch (e) {
					console.error("Failed to generate types:", e);
				} finally {
					running = false;
				}
			}

			function scheduleGenerate() {
				if (debounceTimer) {
					clearTimeout(debounceTimer);
				}

				debounceTimer = setTimeout(() => {
					void generateTypes();
				}, DEFAULT_DEBOUNCE_MS);
			}

			await generateTypes();

			const configChangedHandler = (changedFilePath: string) => {
				if (ctx.resolvedPluginConfig.configPaths.has(changedFilePath)) {
					debuglog("Config changed: " + changedFilePath);
					scheduleGenerate();
				}
			};

			viteDevServer.watcher.on("change", configChangedHandler);

			const originalClose = viteDevServer.close?.bind(viteDevServer);
			viteDevServer.close = async () => {
				try {
					viteDevServer.watcher.off("change", configChangedHandler);
				} finally {
					if (originalClose) {
						await originalClose();
					}
				}
			};
		},

		async buildStart() {
			const buildDts = ctx.resolvedPluginConfig.dts;
			if (buildDts) {
				const root = ctx.resolvedViteConfig.root ?? process.cwd();
				const outputPath = path.resolve(
					root,
					typeof buildDts === "string" ? buildDts : DEFAULT_WORKERS_TYPES_FILE_NAME
				);

				try {
					debuglog(`Generating types for build at ${outputPath}`);

					// Not sure how to get the correct type.
					const resolvedPluginConfig = ctx.resolvedPluginConfig as unknown as {
						configPaths: Set<string>;
						rawConfigs?: { entryWorker?: { config?: { configPath?: string } } };
					};
					const entryWorkerConfigPath = resolvedPluginConfig.rawConfigs?.entryWorker?.config?.configPath;
					const configArg = entryWorkerConfigPath ?? resolvedPluginConfig.configPaths.values().next().value;

					const args = configArg
						? ["types", outputPath, "--config", path.resolve(root, configArg)]
						: ["types", outputPath];
					await execFile("wrangler", args, { cwd: root });
					debuglog(`Types generated for build at ${outputPath}`);
				} catch (e) {
					console.error("Failed to generate types during build:", e);
				}
			}
		},
	};
});
