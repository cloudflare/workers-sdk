/** Build Miniflare and its embedded workerd Workers with Rolldown/Oxc. */
import { cpSync, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "tsdown";
import { bundleWorker } from "../../../tools/build/bundle-worker.mjs";
import { getPackage, pkgRoot } from "./common.mjs";

const watch = process.argv.includes("--watch");
const sourcemap = process.env.SOURCEMAPS !== "false";
const workersRoot = path.join(pkgRoot, "src/workers");
const outPath = path.join(pkgRoot, "dist");
const workersSharedSentryPath = path.join(
	pkgRoot,
	"../workers-shared/utils/sentry.ts"
);
const noopSentryPath = path.join(workersRoot, "assets/sentry-noop.ts");

/** Redirect shared extension imports without changing the standalone Zod Worker. */
function workerPlugins(entry) {
	const sharedExtension = [
		"shared/index.worker.ts",
		"shared/zod.worker.ts",
	].some((file) => entry === path.join(workersRoot, file));
	const assetWorker = [
		"assets/assets.worker.ts",
		"assets/router.worker.ts",
	].some((file) => entry === path.join(workersRoot, file));
	return [
		{
			name: "workerd-extensions",
			resolveId(id, importer) {
				if (sharedExtension && /^node:(assert|buffer)$/.test(id)) {
					return {
						id: `node-internal:internal_${id.slice("node:".length)}`,
						external: true,
					};
				}
				if (
					id === "zod" &&
					entry !== path.join(workersRoot, "shared/zod.worker.ts")
				) {
					return { id: "miniflare:zod", external: true };
				}
				if (assetWorker && importer && /sentry(?:\.ts)?$/.test(id)) {
					const resolved = path.resolve(path.dirname(importer), id);
					if (
						resolved === workersSharedSentryPath ||
						`${resolved}.ts` === workersSharedSentryPath
					) {
						return noopSentryPath;
					}
				}
			},
		},
	];
}

/** Bundle virtual Worker imports and watch every nested dependency. */
function embedWorkersPlugin() {
	return {
		name: "embed-workers",
		async resolveId(id) {
			if (!id.startsWith("worker:")) return;
			let name = id.slice("worker:".length);
			if (!name.endsWith(".worker")) name += ".worker";
			const entry = await this.resolve(path.join(workersRoot, name));
			if (entry === null)
				throw new Error(`Unable to resolve embedded Worker ${id}`);
			return `\0worker:${entry.id}`;
		},
		async load(id) {
			if (!id.startsWith("\0worker:")) return;
			const entry = id.slice("\0worker:".length);
			const relative = path
				.relative(workersRoot, entry)
				.replace(/\.[cm]?[jt]s$/, ".js");
			const { watchFiles } = await bundleWorker(
				{
					input: entry,
					tsconfig: path.join(pkgRoot, "src/workers/tsconfig.json"),
					external: [/^(miniflare|cloudflare|workerd|node-internal):/],
					plugins: workerPlugins(entry),
					transform: {
						define:
							entry ===
							path.join(workersRoot, "local-explorer/explorer.worker.ts")
								? {
										SPARROW_SOURCE_KEY: JSON.stringify(
											process.env.SPARROW_SOURCE_KEY ?? ""
										),
									}
								: {},
					},
				},
				{ file: path.join(outPath, "src/workers", relative), sourcemap }
			);
			for (const file of watchFiles) this.addWatchFile(file);
			return `
    import fs from "node:fs";
    import path from "node:path";
    import url from "node:url";
    let contents;
    export default function() {
     if (contents !== undefined) return contents;
     const filePath = path.join(__dirname, "workers", ${JSON.stringify(relative)});
     contents = fs.readFileSync(filePath, "utf8") + "//# sourceURL=" + url.pathToFileURL(filePath);
     return contents;
    }
   `;
		},
	};
}

// --- Local Explorer UI ---

/**
 * Copy the pre-built local-explorer-ui assets into miniflare's dist folder.
 * The explorer worker serves these files via a workerd disk service, so they
 * must be co-located with the miniflare package at runtime.
 *
 * @param {string} outPath  The miniflare dist output directory (dist/)
 * @param {string} pkgRoot  The miniflare package root
 */
function copyLocalExplorerUi(outPath, pkgRoot) {
	const localExplorerUiSrc = path.join(pkgRoot, "../local-explorer-ui/dist");

	if (existsSync(localExplorerUiSrc)) {
		const localExplorerUiDest = path.join(outPath, "local-explorer-ui");
		cpSync(localExplorerUiSrc, localExplorerUiDest, { recursive: true });
		console.log("Copied local-explorer-ui dist to", localExplorerUiDest);
	} else {
		throw new Error(
			"Expected local-explorer-ui to be at " + localExplorerUiSrc
		);
	}
}

// --- Sourcemap post-processing ---

/**
 * Patch sourcemaps so that every entry in `sourcesContent` is non-null.
 *
 * Rolldown sets `sourcesContent: true` but some upstream dependencies ship
 * their own sourcemaps that reference `.ts` source files they don't publish.
 * Rolldown follows the sourcemap chain and records those paths in `sources`,
 * but can't read the files — leaving `null` holes in `sourcesContent`.
 *
 * Consumers (Vite, Vitest, etc.) warn when they encounter sourcemaps with
 * missing sources. To avoid this, we replace null entries with an empty
 * string so the sourcemap is fully self-contained.
 *
 * See https://github.com/cloudflare/workers-sdk/issues/13555
 *
 * @param {string} outPath  The miniflare dist output directory (dist/)
 */
async function patchSourcemaps(outPath) {
	const mapFiles = [];

	// Collect all .js.map files under outPath
	async function walk(dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.name.endsWith(".js.map")) {
				mapFiles.push(fullPath);
			}
		}
	}

	await walk(outPath);

	for (const mapFile of mapFiles) {
		const raw = await fs.readFile(mapFile, "utf8");
		const map = JSON.parse(raw);
		if (!Array.isArray(map.sourcesContent)) continue;

		let patched = false;
		for (let i = 0; i < map.sourcesContent.length; i++) {
			if (map.sourcesContent[i] == null) {
				map.sourcesContent[i] = "";
				patched = true;
			}
		}

		if (patched) {
			await fs.writeFile(mapFile, JSON.stringify(map));
		}
	}
}

/** Build the published CJS entry, fixture plugins, and lazy-loaded Workers. */
async function buildPackage() {
	const pkg = getPackage(pkgRoot);
	await build({
		cwd: pkgRoot,
		config: false,
		entry: {
			"src/index": "src/index.ts",
			"test/fixtures/unsafe-plugin/index":
				"test/fixtures/unsafe-plugin/index.ts",
			"test/fixtures/echo-plugin/index": "test/fixtures/echo-plugin/index.ts",
		},
		platform: "node",
		format: "cjs",
		outExtensions: () => ({ js: ".js" }),
		outputOptions: { chunkFileNames: "src/[name]-[hash].js" },
		outDir: "dist",
		clean: !watch,
		watch,
		sourcemap,
		dts: false,
		tsconfig: "tsconfig.json",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		deps: {
			neverBundle: [
				"miniflare",
				"esbuild",
				...Object.keys(pkg.dependencies ?? {}),
			],
		},
		plugins: [embedWorkersPlugin()],
		hooks: {
			"build:done": async () => {
				copyLocalExplorerUi(outPath, pkgRoot);
				if (sourcemap) await patchSourcemaps(outPath);
			},
		},
	});
}

buildPackage().catch((error) => {
	console.error("Failed to build miniflare", error);
	process.exitCode = 1;
});
