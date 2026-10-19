import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { hasNodeJsCompat, NodeJsCompat } from "@cloudflare/workers-dev-shared";
import { rspack } from "@rsbuild/core";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type { EnvironmentConfig, Rspack } from "@rsbuild/core";

/** The Worker's entry chunk name, so its main module is `index.js`. */
export const WORKER_ENTRY_NAME = "index";

/**
 * Builds the Rsbuild environment config that bundles a Worker for workerd as
 * a single ES module entry (plus any dynamically imported chunks).
 *
 * @param worker The Worker config with its resolved entrypoint.
 * @param distPath The directory the bundle is written to.
 * @returns An Rsbuild environment config.
 */
export function getWorkerEnvironmentConfig(
	worker: ParsedInputWorkerConfig & { entrypoint: string },
	distPath: string
): EnvironmentConfig {
	const nodeJsCompat = hasNodeJsCompat(worker)
		? new NodeJsCompat(worker)
		: undefined;

	return {
		source: {
			entry: {
				[WORKER_ENTRY_NAME]: {
					import: nodeJsCompat
						? [toDataUri(nodeJsCompat.injectGlobalCode()), worker.entrypoint]
						: worker.entrypoint,
					html: false,
				},
			},
		},
		resolve: {
			conditionNames: ["workerd", "worker", "module", "browser", "import"],
		},
		output: {
			target: "web-worker",
			module: true,
			distPath: { root: distPath, js: "", jsAsync: "" },
			filename: { js: "[name].js" },
			filenameHash: false,
			// As in the Vite plugin, source maps are written to the bundle rather
			// than the public assets, so emit them for readable stack traces.
			sourceMap: { js: "source-map" },
			// Like the Vite plugin and Wrangler, don't minify the Worker, which also
			// keeps license comments in the deployed modules.
			minify: false,
			externals: [
				({ request = "" }, callback) => {
					const nodeRequest = request.startsWith("node:")
						? request
						: `node:${request}`;
					if (request.startsWith("cloudflare:")) {
						return callback(undefined, `module ${request}`);
					}
					if (nodeJsCompat?.externals.has(nodeRequest)) {
						return callback(undefined, `module ${nodeRequest}`);
					}
					return callback();
				},
			],
		},
		performance: { chunkSplit: { strategy: "all-in-one" } },
		dev: { hmr: false, liveReload: false },
		tools: {
			rspack: {
				// Keep the entry's exports, which are the Worker's handlers.
				output: { library: { type: "module" } },
				plugins: nodeJsCompat ? [nodeJsCompatPlugin(nodeJsCompat)] : [],
			},
		},
	};
}

/**
 * Applies the shared Node.js compat aliases and global injections. Requests
 * are rewritten before resolution because rspack rejects `node:` specifiers
 * before `resolve.alias` is applied, and because the polyfills must be resolved
 * from this package rather than the user's project.
 */
function nodeJsCompatPlugin(
	nodeJsCompat: NodeJsCompat
): Rspack.RspackPluginInstance {
	return new rspack.NormalModuleReplacementPlugin(/^[^./]/, (resource) => {
		const virtualModule = nodeJsCompat.getGlobalVirtualModule(resource.request);
		resource.request =
			virtualModule !== undefined
				? toDataUri(virtualModule)
				: (nodeJsCompat.resolveNodeJsImport(resource.request)?.resolved ??
					resource.request);
	});
}

function toDataUri(code: string): string {
	return `data:text/javascript,${encodeURIComponent(code)}`;
}

/**
 * Collects the JavaScript emitted for a Worker into a Miniflare module manifest.
 *
 * @param compilation The Worker environment's compilation.
 * @returns The main module name and every emitted ES module.
 */
export function getManifestFromCompilation(compilation: Rspack.Compilation): {
	mainModule: string;
	modules: Record<string, { type: "esm"; contents: string }>;
} {
	const modules: Record<string, { type: "esm"; contents: string }> = {};
	for (const asset of compilation.getAssets()) {
		if (asset.name.endsWith(".js")) {
			modules[asset.name] = {
				type: "esm",
				contents: asset.source.source().toString(),
			};
		}
	}

	return { mainModule: `${WORKER_ENTRY_NAME}.js`, modules };
}

/**
 * Removes files from the Worker's output directory that the compilation didn't
 * emit, so that the Build Output's inferred modules are exactly the Worker's.
 * Rsbuild copies `public/` into every non-Node environment, and watch rebuilds
 * leave stale chunks behind.
 *
 * @param distPath The Worker environment's output directory.
 * @param compilation The Worker environment's compilation.
 */
export async function removeUnemittedFiles(
	distPath: string,
	compilation: Rspack.Compilation
): Promise<void> {
	const emitted = new Set(
		compilation.getAssets().map(({ name }) => path.join(distPath, name))
	);
	const entries = await fsp.readdir(distPath, {
		recursive: true,
		withFileTypes: true,
	});
	await Promise.all(
		entries
			.map((entry) => path.join(entry.parentPath, entry.name))
			.filter((file, index) => entries[index]?.isFile() && !emitted.has(file))
			.map((file) => fsp.rm(file))
	);
}
