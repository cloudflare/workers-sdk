import { join, resolve } from "node:path";
import {
	BuildContext,
	BuildOptions,
	context,
	Plugin,
	build as runBuild,
} from "esbuild";

type EmbedWorkersOptions = {
	/**
	 * workersRootDir is a path to a directory containing external Workers that
	 * will be bundled
	 */
	workersRootDir: string;
	workerOutputDir: string;
};

/**
 * embedWorkerPlugin is an ESBuild plugin that will look for imports to Workers specified by `worker:`
 * and bundle them into the final output.
 */
export const embedWorkersPlugin: (options: EmbedWorkersOptions) => Plugin = ({
	workerOutputDir,
	workersRootDir,
}) => {
	return {
		name: "embed-workers",
		setup(build) {
			const namespace = "embed-worker";
			// For imports prefixed with `worker:`, attempt to resolve them from a directory containing
			// your Workers
			build.onResolve({ filter: /^worker:/ }, async (args) => {
				let name = args.path.substring("worker:".length);
				// Allow `.worker` to be omitted
				if (!name.endsWith(".worker")) name += ".worker";
				// Use `build.resolve()` API so Workers can be written as `m?[jt]s` files
				const result = await build.resolve("./" + name, {
					kind: "import-statement",
					// Resolve relative to the directory containing the Workers
					resolveDir: workersRootDir,
				});
				if (result.errors.length > 0) return { errors: result.errors };
				return { path: result.path, namespace };
			});
			build.onLoad({ filter: /.*/, namespace }, async (args) => {
				await runBuild({
					platform: "node", // Marks `node:*` imports as external
					format: "esm",
					target: "esnext",
					bundle: true,
					sourcemap: true,
					sourcesContent: false,
					external: ["cloudflare:workers"],
					entryPoints: [args.path],
					minifySyntax: true,
					outdir: workerOutputDir,
					plugins: [],
				});

				let outPath = args.path.substring(workersRootDir.length + 1);
				outPath = outPath.substring(0, outPath.lastIndexOf(".")) + ".js";
				outPath = JSON.stringify(outPath);
				const contents = `
	  import fs from "fs";
	  import path from "path";
	  import url from "url";
	  let contents;
	  export default function() {
		 if (contents !== undefined) return contents;
		 const filePath = path.join(__dirname, "workers", ${outPath});
		 contents = fs.readFileSync(filePath, "utf8") + "//# sourceURL=" + url.pathToFileURL(filePath);
		 return contents;
	  }
	  `;
				return { contents, loader: "js" };
			});
		},
	};
};

const distDir = resolve(__dirname, "../dist");
// When outputting the Worker, map to the structure of 'src'.
// This means the plugin will outout the build Workers to a `workers` dist in `dir`
const workerOutputDir = resolve(distDir, "workers");
const workersDir = resolve(__dirname, "../src/workers");

export async function buildPackage() {
	console.log("Building the module");
	await runBuild({
		platform: "node",
		target: "esnext",
		format: "cjs",
		bundle: true,
		sourcemap: true,
		entryPoints: ["src/index.ts"],
		plugins: [
			embedWorkersPlugin({
				workersRootDir: workersDir,
				workerOutputDir,
			}),
		],
		external: ["@cloudflare/workers-types", "miniflare"],
		outdir: distDir,
	});
}

buildPackage().catch((exc) => {
	console.error("Failed to build external package", `${exc}`);
});
