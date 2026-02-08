import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { createPlugin, debuglog } from "../utils";
import { assertIsNotPreview, type PluginContext } from "../context";
const execFile = promisify(execFileCb);
const DEFAULT_WORKERS_TYPES_FILE_NAME = "worker-configuration.d.ts";
const DEFAULT_DEBOUNCE_MS = 100;

function resolveConfigPath(ctx: PluginContext): string | undefined {
	if (ctx.resolvedPluginConfig.type === "preview") {
		return undefined;
	}

	const entryWorkerConfigPath = ctx.resolvedPluginConfig.rawConfigs?.entryWorker?.config?.configPath;
	if (entryWorkerConfigPath) {
		return entryWorkerConfigPath;
	}

	const firstIter = ctx.resolvedPluginConfig.configPaths.values().next();
	return firstIter.done ? undefined : firstIter.value;
}

function getErrorDetails(e: unknown): {
	message: string;
	possibleCause?: string;
	stderr?: string;
} {
	const fallbackMessage = "Unknown error";
	let message = fallbackMessage;
	let stderr: string | undefined;
	let possibleCause: string | undefined;

	if (e instanceof Error) {
		message = e.message;
	}

	if (typeof e === "object" && e !== null) {
		const errorWithCode = e as { code?: string; stderr?: string; message?: string };
		if (typeof errorWithCode.stderr === "string" && errorWithCode.stderr.trim()) {
			stderr = errorWithCode.stderr.trim();
		}
		if (typeof errorWithCode.message === "string" && errorWithCode.message.trim()) {
			message = errorWithCode.message.trim();
		}
		if (errorWithCode.code === "ENOENT") {
			possibleCause =
				"Wrangler CLI executable 'wrangler' was not found. Ensure it is installed and available on your PATH.";
		}
	}

	return { message, possibleCause, stderr };
}

async function runWranglerTypes(options: {
	ctx: PluginContext;
	root: string;
	outputPath: string;
	contextLabel: string;
}): Promise<void> {
	const { ctx, root, outputPath, contextLabel } = options;
	const configArg = resolveConfigPath(ctx);
	const args = configArg
		? ["types", outputPath, "--config", path.resolve(root, configArg)]
		: ["types", outputPath];

	try {
		debuglog(`Generating types ${contextLabel} at ${outputPath}`);
		await execFile("wrangler", args, { cwd: root });
		debuglog(`Types generated ${contextLabel} at ${outputPath}`);
	} catch (e) {
		const { message, possibleCause, stderr } = getErrorDetails(e);
		console.error(`Failed to generate types ${contextLabel}.`);
		if (possibleCause) {
			console.error("Possible cause:", possibleCause);
		} else {
			console.error(
				"Possible causes include: wrangler not being installed, not being on your PATH, or an invalid wrangler configuration."
			);
		}
		if (stderr) {
			console.error("Details:", stderr);
		}
		console.error("Underlying error:", message);
	}
}

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
					await runWranglerTypes({
						ctx,
						root,
						outputPath,
						contextLabel: "for dev server",
					});
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
					if (debounceTimer) {
						clearTimeout(debounceTimer);
						debounceTimer = undefined;
					}
				} finally {
					if (originalClose) {
						await originalClose();
					}
				}
			};
		},

		async buildStart() {
			assertIsNotPreview(ctx);

			const buildDts = ctx.resolvedPluginConfig.dts;
			if (buildDts) {
				const root = ctx.resolvedViteConfig.root ?? process.cwd();
				const outputPath = path.resolve(
					root,
					typeof buildDts === "string" ? buildDts : DEFAULT_WORKERS_TYPES_FILE_NAME
				);

				await runWranglerTypes({
					ctx,
					root,
					outputPath,
					contextLabel: "during build",
				});
			}
		},
	};
});
