import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import esbuild from "esbuild";
import { Miniflare } from "miniflare";
import { useDispose } from "./miniflare";
import { useTmp } from "./storage";
import type { ExpectStatic } from "vitest";

export const FIXTURES_PATH = path.resolve(
	require.resolve("miniflare"),
	"..",
	"..",
	"..",
	"test",
	"fixtures"
);

/**
 * EXPORTED_FIXTURES will point to the fixtures directory in the transpiled
 * miniflare code (aka the `dist` folder)
 */
export const EXPORTED_FIXTURES = path.resolve(
	// Will look like `dist/src/index.js`
	require.resolve("miniflare"),
	"..",
	"..",
	"test",
	"fixtures"
);

export async function runWorkerTest(
	expect: ExpectStatic,
	testName: string,
	...fixturePath: string[]
): Promise<void> {
	const tmp = await useTmp(testName);
	await esbuild.build({
		entryPoints: [path.join(FIXTURES_PATH, ...fixturePath)],
		format: "esm",
		external: ["node:assert", "node:buffer", "miniflare:shared"],
		bundle: true,
		sourcemap: "inline",
		outdir: tmp,
	});
	const entryFileName = fixturePath.at(-1);
	assert(entryFileName !== undefined);
	const outputFileName =
		entryFileName.substring(0, entryFileName.lastIndexOf(".")) + ".js";

	// The new config format requires module contents to be provided inline via
	// the worker `manifest`, rather than read from disk.
	const contents = await fs.readFile(path.join(tmp, outputFileName), "utf8");

	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2023-08-01",
					compatibilityFlags: ["nodejs_compat", "experimental"],
					manifest: {
						mainModule: outputFileName,
						modulesRoot: tmp,
						modules: {
							[outputFileName]: { type: "esm", contents },
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	expect(response.ok, await response.text()).toBe(true);
}
