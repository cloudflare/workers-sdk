import assert from "node:assert";
import path from "node:path";
import esbuild from "esbuild";
import { Miniflare } from "miniflare";
import { expect } from "vitest";
import { useDispose } from "./miniflare";
import { useTmp } from "./storage";

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
	testName: string,
	...fixturePath: string[]
): Promise<void> {
	const tmp = await useTmp(testName);
	await esbuild.build({
		entryPoints: [path.join(FIXTURES_PATH, ...fixturePath)],
		format: "esm",
		external: ["node:assert", "node:buffer", "miniflare:shared"],
		bundle: true,
		sourcemap: true,
		outdir: tmp,
	});
	const entryFileName = fixturePath.at(-1);
	assert(entryFileName !== undefined);
	const outputFileName =
		entryFileName.substring(0, entryFileName.lastIndexOf(".")) + ".js";

	const mf = new Miniflare({
		modulesRoot: tmp,
		modules: [{ type: "ESModule", path: path.join(tmp, outputFileName) }],
		compatibilityDate: "2023-08-01",
		compatibilityFlags: ["nodejs_compat", "experimental"],
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	expect(response.ok, await response.text()).toBe(true);
}
