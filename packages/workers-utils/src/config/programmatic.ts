/**
 * Programmatic config loading for TypeScript/JavaScript config files.
 *
 * This module handles:
 * 1. Bundling the config file with esbuild
 * 2. Writing to a temp file and importing it
 * 3. Executing the config function with context
 * 4. Returning WorkerConfig directly (no RawConfig conversion)
 * 5. Watching for changes with automatic dependency tracking
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import type { StartDevWorkerInput } from "../types";
import type { BuildContext } from "esbuild";

/**
 * Context passed to the worker configuration function.
 */
export interface WorkerConfigContext {
	/**
	 * The environment/stage name from the `--env` CLI flag.
	 * Undefined if no `--env` flag was provided.
	 */
	env: string | undefined;
}

/**
 * Fields from StartDevWorkerInput that are wrangler-internal or CLI-only
 * concerns and should not appear in the user-facing programmatic config.
 */
type InternalFields =
	| "config" // the config file path itself
	| "env" // comes from --env CLI flag
	| "envFiles" // internal .env file loading
	| "legacy" // legacy site support
	| "experimental" // internal feature flags
	| "bindings" // renamed to `env` in WorkerConfig for user ergonomics
	| "migrations" // DO migrations are managed separately
	| "build"; // replaced with narrowed version below

/**
 * The subset of StartDevWorkerInput["build"] exposed in programmatic config.
 * Excludes only nodejsCompatMode (internal Hook depending on Config).
 */
type WorkerConfigBuild = Omit<
	NonNullable<StartDevWorkerInput["build"]>,
	"nodejsCompatMode"
>;

/**
 * Configuration options for a Cloudflare Worker.
 *
 * Derived from `StartDevWorkerInput` — the canonical type for worker configuration.
 * Omits internal/CLI-only fields and narrows `build` to exclude internal hooks.
 *
 * Required fields are `name` and `entrypoint`.
 */
export type WorkerConfig = Omit<StartDevWorkerInput, InternalFields> &
	Required<Pick<StartDevWorkerInput, "name" | "entrypoint">> & {
		/**
		 * Bindings available to the worker, keyed by the name exposed on the `env` object.
		 *
		 * @example
		 * ```ts
		 * env: {
		 *   MY_KV: { type: "kv_namespace", id: "abc123" },
		 *   API_KEY: { type: "plain_text", value: "secret" },
		 * }
		 * ```
		 */
		env?: StartDevWorkerInput["bindings"];
		/** Build configuration options. */
		build?: WorkerConfigBuild;
	};

/**
 * A function that returns worker configuration.
 * Can be synchronous or asynchronous.
 */
export type WorkerConfigFn = (
	ctx: WorkerConfigContext
) => WorkerConfig | Promise<WorkerConfig>;

/**
 * Helper function to define a worker configuration with type safety.
 */
export function defineConfig(fn: WorkerConfigFn): WorkerConfigFn {
	return fn;
}

export interface LoadProgrammaticConfigOptions {
	/** The path to the programmatic config file (.ts or .js) */
	configPath: string;
	/** The environment/stage name from --env flag */
	env: string | undefined;
	/** Directory for temporary build artifacts. If not provided, uses a .wrangler/tmp dir next to the config. */
	tmpDir?: string;
}

export interface LoadProgrammaticConfigResult {
	/** The loaded and validated WorkerConfig */
	workerConfig: WorkerConfig;
}

/**
 * Load and execute a programmatic config file.
 *
 * This function:
 * 1. Bundles the config file with esbuild (externalizing node_modules)
 * 2. Writes to a temp file and imports it
 * 3. Executes the config function with context
 * 4. Returns the validated WorkerConfig directly
 */
export async function loadProgrammaticConfig(
	options: LoadProgrammaticConfigOptions
): Promise<LoadProgrammaticConfigResult> {
	const { configPath, env, tmpDir } = options;
	const configDir = path.dirname(path.resolve(configPath));

	// Find user's tsconfig for esbuild target
	const tsconfigPath = findTsConfig(configDir);

	// Use provided tmpDir or fall back to .wrangler/tmp next to the config
	const outDir = tmpDir ?? path.join(configDir, ".wrangler", "tmp");
	await fs.promises.mkdir(outDir, { recursive: true });
	const tmpFile = path.join(
		outDir,
		`cf-config-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
	);

	try {
		// Bundle the config file with esbuild
		// Bundle user's relative imports, but externalize all node_modules
		// (they'll be resolved from the original config location at runtime)
		await esbuild.build({
			entryPoints: [configPath],
			bundle: true,
			platform: "node",
			format: "esm",
			outfile: tmpFile,
			// Use user's tsconfig if available
			tsconfig: tsconfigPath,
			// Externalize all node_modules - they'll resolve from config dir
			packages: "external",
			// Silence most warnings
			logLevel: "error",
		});

		// Import the bundled config
		// Use file:// URL for cross-platform compatibility
		const fileUrl = `file://${tmpFile}`;
		const module = await import(fileUrl);

		// Get the default export (should be the config function)
		const configFn = module.default;

		if (typeof configFn !== "function") {
			throw new Error(
				`Config file must export a function as default export. ` +
					`Got ${typeof configFn}. Use: export default defineConfig(() => ({ ... }))`
			);
		}

		// Create context and execute the config function
		const ctx: WorkerConfigContext = { env };
		const workerConfig = await configFn(ctx);

		// Validate the config has required fields
		validateWorkerConfig(workerConfig, configPath);

		return { workerConfig };
	} finally {
		// Clean up temp file
		try {
			await fs.promises.unlink(tmpFile);
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Find the nearest tsconfig.json for esbuild.
 */
function findTsConfig(startDir: string): string | undefined {
	let dir = startDir;
	while (true) {
		const tsconfig = path.join(dir, "tsconfig.json");
		if (fs.existsSync(tsconfig)) {
			return tsconfig;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

/**
 * Validate that the WorkerConfig has required fields.
 */
function validateWorkerConfig(
	config: unknown,
	configPath: string
): asserts config is WorkerConfig {
	if (!config || typeof config !== "object") {
		throw new Error(
			`Config function must return an object. Got ${typeof config} in ${configPath}`
		);
	}

	const cfg = config as Record<string, unknown>;

	if (typeof cfg.name !== "string" || !cfg.name) {
		throw new Error(
			`Config must have a "name" property (string). Missing or invalid in ${configPath}`
		);
	}

	if (typeof cfg.entrypoint !== "string" || !cfg.entrypoint) {
		throw new Error(
			`Config must have an "entrypoint" property (string). Missing or invalid in ${configPath}`
		);
	}
}

// ============================================================================
// Config Watching (Hot Reload)
// ============================================================================

export interface WatchProgrammaticConfigOptions {
	/** The path to the programmatic config file (.ts or .js) */
	configPath: string;
	/** The environment/stage name from --env flag */
	env: string | undefined;
	/** Callback when config changes (after successful rebuild) */
	onChange: (result: LoadProgrammaticConfigResult) => void;
	/** Callback when an error occurs during rebuild */
	onError?: (error: Error) => void;
	/** Directory for temporary build artifacts. If not provided, uses a .wrangler/tmp dir next to the config. */
	tmpDir?: string;
}

export interface ConfigWatcher {
	/** Stop watching and clean up resources */
	stop: () => Promise<void>;
}

/**
 * Watch a programmatic config file for changes.
 *
 * Uses esbuild's watch mode which automatically tracks all dependencies
 * (imported files) and triggers a rebuild when any of them change.
 *
 * @returns A ConfigWatcher with a stop() method to clean up
 */
export async function watchProgrammaticConfig(
	options: WatchProgrammaticConfigOptions
): Promise<ConfigWatcher> {
	const { configPath, env, onChange, onError, tmpDir } = options;
	const configDir = path.dirname(path.resolve(configPath));

	// Find user's tsconfig for esbuild target
	const tsconfigPath = findTsConfig(configDir);

	// Use provided tmpDir or fall back to .wrangler/tmp next to the config
	const outDir = tmpDir ?? path.join(configDir, ".wrangler", "tmp");
	await fs.promises.mkdir(outDir, { recursive: true });

	// Use a stable filename for watch mode (esbuild will overwrite it)
	const tmpFile = path.join(outDir, `cf-config-watch.mjs`);

	// Track if this is the initial build
	let isInitialBuild = true;
	let ctx: BuildContext | undefined;

	// AbortController to cancel in-flight config loads when a new build comes in
	// This prevents race conditions where an older build's async work completes
	// after a newer build has already started processing
	let loadAbortController = new AbortController();

	// Create an esbuild plugin that triggers after each successful build
	const watchPlugin: esbuild.Plugin = {
		name: "config-watch-plugin",
		setup(build) {
			build.onEnd(async (result) => {
				// Skip the initial build - caller should use loadProgrammaticConfig() for that
				if (isInitialBuild) {
					isInitialBuild = false;
					return;
				}

				// Cancel any in-flight config loads from previous builds
				loadAbortController.abort();
				loadAbortController = new AbortController();
				const signal = loadAbortController.signal;

				// If there are errors, report them but don't try to load the config
				if (result.errors.length > 0) {
					const errorMessage = result.errors.map((e) => e.text).join("\n");
					onError?.(new Error(`Config build failed:\n${errorMessage}`));
					return;
				}

				try {
					// Import the rebuilt config
					// Add cache-busting query to force re-import
					const fileUrl = `file://${tmpFile}?t=${Date.now()}`;
					const module = await import(fileUrl);

					// Check if this load was aborted (newer build came in)
					if (signal.aborted) return;

					const configFn = module.default;
					if (typeof configFn !== "function") {
						throw new Error(
							`Config file must export a function as default export. ` +
								`Got ${typeof configFn}. Use: export default defineConfig(() => ({ ... }))`
						);
					}

					// Execute the config function
					const configCtx: WorkerConfigContext = { env };
					const workerConfig = await configFn(configCtx);

					// Check again after async config function execution
					if (signal.aborted) return;

					// Validate the config
					validateWorkerConfig(workerConfig, configPath);

					// Notify the caller directly with the WorkerConfig
					onChange({ workerConfig });
				} catch (err) {
					// Don't report errors if this load was aborted
					if (signal.aborted) return;

					onError?.(
						err instanceof Error
							? err
							: new Error(`Config reload failed: ${err}`)
					);
				}
			});
		},
	};

	// Create esbuild context with watch mode
	ctx = await esbuild.context({
		entryPoints: [configPath],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile: tmpFile,
		tsconfig: tsconfigPath,
		packages: "external",
		logLevel: "error",
		plugins: [watchPlugin],
	});

	// Start watching
	await ctx.watch();

	return {
		stop: async () => {
			// Abort any in-flight config loads
			loadAbortController.abort();
			await ctx?.dispose();
			// Clean up temp file
			try {
				await fs.promises.unlink(tmpFile);
			} catch {
				// Ignore cleanup errors
			}
		},
	};
}
