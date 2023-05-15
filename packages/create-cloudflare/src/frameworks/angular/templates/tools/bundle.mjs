import fs from "node:fs/promises";
import path from "node:path";
import { worker as workerPath } from "./paths.mjs";
import * as esbuild from "esbuild";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import fg from "fast-glob";

// Process each of the JS files in the `_worker.js` directory
for (const entry of await fg("**/*.js", { cwd: workerPath, onlyFiles: true })) {
	if (entry === "index.js") {
		// This is the main bundle and gets special treatment
		await bundleMain();
	} else {
		await bundleLazyModule(entry);
	}
}

// Use esbuild to process the main entry-point.
// - shim Node.js APIs
// - convert `global` to `globalThis`
// - convert dynamic `require()` calls to `await import()` calls
// - ensure that the Cloudflare `fetch()` handler is exported
async function bundleMain() {
	const result = await esbuild.build({
		entryPoints: ["index.js"],
		bundle: true,
		format: "iife",
		write: false,
		absWorkingDir: workerPath,
		define: {
			global: "globalThis",
		},
		plugins: [
			NodeGlobalsPolyfillPlugin({ buffer: true }),
			NodeModulesPolyfillPlugin(),
		],
	});

	let main = result.outputFiles[0].text;

	// Patch any dynamic imports (converting `require()` calls to `import()` calls).
	main = main.replace(
		'installChunk(__require("./" + __webpack_require__.u(chunkId))',
		'promises.push(import("./" + __webpack_require__.u(chunkId)).then((mod) => installChunk(mod.default))'
	);
	// Export the fetch handler (grabbing it from the global).
	main += "\nexport default { fetch : globalThis.__workerFetchHandler };";

	await fs.writeFile(path.resolve(workerPath, "index.js"), main);
}

// Use esbuild to process the lazy load modules
// In particular we need to convert the CommonJS export syntax to ESM.
async function bundleLazyModule(filePath) {
	const result = await esbuild.build({
		entryPoints: [filePath],
		bundle: true,
		format: "cjs",
		write: false,
		absWorkingDir: workerPath,
		define: {
			global: "globalThis",
		},
		plugins: [NodeModulesPolyfillPlugin()],
	});

	let content = result.outputFiles[0].text;

	// Export the fetch handler (grabbing it from the global).
	content = "const exports = {};\n" + content + "\nexport default exports";

	await fs.writeFile(path.resolve(workerPath, filePath), content);
}
