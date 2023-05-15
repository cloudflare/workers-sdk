import fs from "fs/promises";
import path from "path";
import test from "ava";
import esbuild from "esbuild";
import { Miniflare } from "miniflare";
import { useTmp } from "../../../test-shared";

const FIXTURES_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"..",
	"test",
	"fixtures",
	"source-maps"
);
const SERVICE_WORKER_ENTRY_PATH = path.join(FIXTURES_PATH, "service-worker.ts");
const MODULES_ENTRY_PATH = path.join(FIXTURES_PATH, "modules.ts");

test("source maps workers", async (t) => {
	// Build fixtures
	const tmp = await useTmp(t);
	await esbuild.build({
		entryPoints: [SERVICE_WORKER_ENTRY_PATH, MODULES_ENTRY_PATH],
		format: "esm",
		bundle: true,
		sourcemap: true,
		outdir: tmp,
	});
	const serviceWorkerPath = path.join(tmp, "service-worker.js");
	const modulesPath = path.join(tmp, "modules.js");
	const serviceWorkerContent = await fs.readFile(serviceWorkerPath, "utf8");
	const modulesContent = await fs.readFile(modulesPath, "utf8");

	// Check service-workers source mapped
	const mf = new Miniflare({
		workers: [
			{
				bindings: { MESSAGE: "unnamed" },
				scriptPath: serviceWorkerPath,
			},
			{
				name: "a",
				routes: ["*/a"],
				bindings: { MESSAGE: "a" },
				script: serviceWorkerContent,
				scriptPath: serviceWorkerPath,
			},
		],
	});
	let error = await t.throwsAsync(mf.dispatchFetch("http://localhost"), {
		message: "unnamed",
	});
	t.regex(String(error?.stack), /service-worker\.ts:6:17/);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/a"), {
		message: "a",
	});
	t.regex(String(error?.stack), /service-worker\.ts:6:17/);

	// Check modules workers source mapped
	await mf.setOptions({
		workers: [
			{
				modules: true,
				scriptPath: modulesPath,
				bindings: { MESSAGE: "unnamed" },
			},
			{
				name: "a",
				routes: ["*/a"],
				bindings: { MESSAGE: "a" },
				modules: true,
				script: modulesContent,
				scriptPath: modulesPath,
			},
			{
				name: "b",
				routes: ["*/b"],
				bindings: { MESSAGE: "b" },
				modules: [{ type: "ESModule", path: modulesPath }],
			},
			{
				name: "c",
				routes: ["*/c"],
				bindings: { MESSAGE: "c" },
				modules: [
					{ type: "ESModule", path: modulesPath, contents: modulesContent },
				],
			},
			{
				name: "d",
				routes: ["*/d"],
				bindings: { MESSAGE: "d" },
				modulesRoot: tmp,
				modules: [{ type: "ESModule", path: modulesPath }],
			},
		],
	});
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost"), {
		message: "unnamed",
	});
	t.regex(String(error?.stack), /modules\.ts:5:19/);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/a"), {
		message: "a",
	});
	t.regex(String(error?.stack), /modules\.ts:5:19/);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/b"), {
		message: "b",
	});
	t.regex(String(error?.stack), /modules\.ts:5:19/);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/c"), {
		message: "c",
	});
	t.regex(String(error?.stack), /modules\.ts:5:19/);
	error = await t.throwsAsync(mf.dispatchFetch("http://localhost/d"), {
		message: "d",
	});
	t.regex(String(error?.stack), /modules\.ts:5:19/);
});
