import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import type { RawConfig } from "./config";

/**
 * Get common esbuild options for loading a Wrangler config file
 */
function getEsbuildOptions(
	configPath: string,
	tmpFile: string
): esbuild.BuildOptions {
	return {
		entryPoints: [configPath],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile: tmpFile,
		// Externalize all node_modules, which will be resolved at runtime
		packages: "external",
		logLevel: "error",
	};
}

/**
 * Load config directly from a bundled config file, which exports either a function or an object
 */
async function loadFunctionOrObjectConfig(
	file: string,
	ctx: WorkerConfigContext
): Promise<WorkerConfig> {
	// Use file:// URL for cross-platform compatibility
	const fileUrl = `file://${file}`;
	const module = await import(fileUrl);

	const configFnOrValue = module.default;

	if (typeof configFnOrValue === "function") {
		// Of the form `defineConfig(() => ({...}))`
		return await configFnOrValue(ctx);
	} else if (configFnOrValue && typeof configFnOrValue === "object") {
		// Of the form `defineConfig({...})`
		return configFnOrValue;
	}

	throw new Error(
		`Config file must export the defineConfig() function, with either a function or object config. ` +
			`Instead, the default export was of type: ${typeof configFnOrValue}. Use: export default defineConfig(() => ({ ... }))`
	);
}

export interface WorkerConfigContext {
	/**
	 * The environment name from the `--env` CLI flag.
	 * Undefined if no `--env` flag was provided.
	 */
	env: string | undefined;
}

/**
 * The subset of RawConfig exposed in programmatic config.
 * We omit `env` because a programmatic config should not have statically defined environments.
 * Instead, the return value should be dynamic based on the `ctx.env` argument
 */
export type WorkerConfig = Omit<RawConfig, "env">;

/**
 * A function that returns worker configuration.
 * Can be synchronous or asynchronous.
 */
export type WorkerConfigFn = (
	ctx: WorkerConfigContext
) => WorkerConfig | Promise<WorkerConfig>;

/**
 * Helper function to define a worker configuration with type safety.
 * Accepts either a config object directly or a function that returns one.
 * TODO(followup): return the inferred `Env` type rather than `WorkerConfigFn`
 */
export function defineConfig(
	fnOrConfig: WorkerConfigFn | WorkerConfig
): WorkerConfigFn | WorkerConfig {
	return fnOrConfig;
}

export interface LoadProgrammaticConfigOptions {
	/** The path to the programmatic config file (.ts or .js) */
	configPath: string;
	/** The environment name from --env flag */
	env: string | undefined;
}

/**
 * Load and execute a programmatic config file.
 */
export async function loadProgrammaticConfig({
	configPath,
	env,
}: LoadProgrammaticConfigOptions): Promise<WorkerConfig> {
	const tmpDir = path.join(path.dirname(configPath), ".wrangler/config");
	// Make sure the output directory exists
	await fs.promises.mkdir(tmpDir, { recursive: true });

	const tmpFile = path.join(
		tmpDir,
		`cf-config-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
	);

	try {
		await esbuild.build(getEsbuildOptions(configPath, tmpFile));

		return await loadFunctionOrObjectConfig(tmpFile, { env });
	} catch (e) {
		const error = new Error(`Failed to load config file: ${configPath}`);
		error.cause = e;
		throw error;
	} finally {
		try {
			await fs.promises.unlink(tmpFile);
		} catch {
			// Ignore cleanup errors (especially on Windows)
		}
	}
}

/**
 * Watch a programmatic config file for changes.
 *
 * Uses esbuild's watch mode which automatically tracks all dependencies
 * and triggers a rebuild when any of them change.
 *
 * @returns A ConfigWatcher with a stop() method to clean up
 */
export async function watchProgrammaticConfig({
	configPath,
	env,
	onChange,
	onError,
}: LoadProgrammaticConfigOptions & {
	/** Callback when config changes (after successful rebuild) */
	onChange: (result: WorkerConfig) => void;
	/** Callback when an error occurs during rebuild */
	onError?: (error: Error) => void;
}): Promise<{
	close: () => Promise<void>;
	closed: boolean;
}> {
	const tmpDir = path.join(path.dirname(configPath), ".wrangler/config");
	// Make sure the output directory exists
	await fs.promises.mkdir(tmpDir, { recursive: true });

	const tmpFile = path.join(tmpDir, `cf-config-watch.mjs`);

	let isInitialBuild = true;

	// AbortController to cancel in-flight config loads when a new build comes in
	// This prevents race conditions where an older build's async work completes
	// after a newer build has already started processing
	let loadAbortController = new AbortController();

	const watchPlugin: esbuild.Plugin = {
		name: "config-watch-plugin",
		setup(build) {
			build.onEnd(async (result) => {
				/**
				 * Skip the initial build. Instead, consumers should call `loadProgrammaticConfig()`  directly.
				 * This matches how chokidar is set up for file watching in Wrangler, and allows this function to be slotted
				 * in more easily. In future we can re-evaluate and potentially refactor.
				 */
				if (isInitialBuild) {
					isInitialBuild = false;
					return;
				}

				loadAbortController.abort();
				loadAbortController = new AbortController();
				const signal = loadAbortController.signal;

				if (result.errors.length > 0) {
					const errorMessage = result.errors.map((e) => e.text).join("\n");
					onError?.(new Error(`Failed to load config file:\n${errorMessage}`));
					// Skip loading the config if there are errors
					return;
				}

				try {
					const workerConfig = await loadFunctionOrObjectConfig(tmpFile, {
						env,
					});

					if (signal.aborted) {
						return;
					}

					onChange(workerConfig);
				} catch (e) {
					// Don't report errors if this load was aborted
					if (signal.aborted) {
						return;
					}
					const error = new Error(
						`Failed to reload config file: ${configPath}`
					);
					error.cause = e;
					onError?.(error);
				}
			});
		},
	};

	const ctx = await esbuild.context({
		...getEsbuildOptions(configPath, tmpFile),
		plugins: [watchPlugin],
	});

	await ctx.watch();

	let closed = false;

	return {
		close: async () => {
			closed = true;
			loadAbortController.abort();
			await ctx?.dispose();
			try {
				await fs.promises.unlink(tmpFile);
			} catch {
				// Ignore cleanup errors
			}
		},
		get closed() {
			return closed;
		},
	};
}
