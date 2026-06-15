/**
 * The shape of `wrangler.config.ts` — tooling / bundling / dev-server
 * configuration that complements the Worker configuration authored in
 * `cloudflare.config.ts` via `defineWorker`.
 */
export interface WranglerConfig {
	// Bundling
	noBundle?: boolean;
	minify?: boolean;
	keepNames?: boolean;
	alias?: Record<string, string>;
	define?: Record<string, string>;
	findAdditionalModules?: boolean;
	preserveFileNames?: boolean;
	baseDir?: string;
	rules?: Array<{
		type:
			| "ESModule"
			| "CommonJS"
			| "CompiledWasm"
			| "Text"
			| "Data"
			| "PythonModule"
			| "PythonRequirement";
		globs: string[];
		fallthrough?: boolean;
	}>;
	wasmModules?: Record<string, string>;
	textBlobs?: Record<string, string>;
	dataBlobs?: Record<string, string>;
	tsconfig?: string;
	jsxFactory?: string;
	jsxFragment?: string;
	pythonModules?: { exclude?: string[] };
	uploadSourceMaps?: boolean;
	build?: { command?: string; cwd?: string; watchDir?: string | string[] };
	/**
	 * Assets directory — the only tooling-side asset setting. The runtime
	 * asset fields (`binding`, `htmlHandling`, `notFoundHandling`,
	 * `runWorkerFirst`) live in `cloudflare.config.ts` under `assets`.
	 */
	assetsDirectory?: string;
	// Dev/local
	dev?: {
		ip?: string;
		port?: number;
		inspectorPort?: number;
		inspectorIp?: string;
		localProtocol?: "http" | "https";
		upstreamProtocol?: "http" | "https";
		host?: string;
		/**
		 * Type-generation settings. Consumed directly by the new-config
		 * type-generation path (`regenerateNewConfigTypes`) — NOT threaded
		 * through the merged `RawConfig`. Default: `{ generate: true }`.
		 * Structured as an object to allow additional properties in future.
		 */
		types?: { generate?: boolean };
		/**
		 * Container-related dev settings. `containers` itself is currently not
		 * supported under `--experimental-new-config`, but these dev-time settings are
		 * accepted so users can enable them ahead of `containers` opening up.
		 * They're no-ops when `containers` is absent.
		 */
		enableContainers?: boolean;
		/**
		 * Either the Docker unix socket (e.g. `unix:///var/run/docker.sock`) or
		 * a full configuration. The string form is the common case; the full
		 * object form (with `localDocker.socketPath` and TLS settings) can be
		 * added later if needed.
		 */
		containerEngine?: string;
	};
	sendMetrics?: boolean;
}
