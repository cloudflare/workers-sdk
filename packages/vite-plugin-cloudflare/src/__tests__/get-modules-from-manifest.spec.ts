import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, onTestFinished, test } from "vitest";
import { getModulesFromManifest } from "../miniflare-options";
import type { Bundle } from "../build-output-preview";
import type { ModuleType } from "@cloudflare/config";

function moduleContentsToString(contents: string | Uint8Array): string {
	return typeof contents === "string"
		? contents
		: Buffer.from(contents).toString();
}

async function createBundle(
	modules: Record<string, { type: ModuleType; contents?: string }>,
	mainModule = "index.js"
): Promise<Bundle> {
	const rootPath = await mkdtemp(path.join(os.tmpdir(), "vite-mf-manifest-"));
	onTestFinished(async () => {
		await rm(rootPath, { recursive: true, force: true });
	});

	for (const [modulePath, { contents }] of Object.entries(modules)) {
		await mkdir(path.dirname(path.join(rootPath, modulePath)), {
			recursive: true,
		});
		await writeFile(path.join(rootPath, modulePath), contents ?? modulePath);
	}

	return {
		rootPath,
		mainModule,
		modules: Object.fromEntries(
			Object.entries(modules).map(([modulePath, { type }]) => [
				modulePath,
				{ type },
			])
		),
	};
}

describe("getModulesFromManifest", () => {
	test("keeps `mainModule` and module names relative", async ({ expect }) => {
		const result = await getModulesFromManifest(
			await createBundle({
				"assets/data.bin": { type: "data" },
				"index.js": { type: "esm" },
				"assets/text.txt": { type: "text" },
			})
		);

		expect(result.mainModule).toBe("index.js");
		expect(Object.keys(result.modules)).toEqual([
			"index.js",
			"assets/data.bin",
			"assets/text.txt",
		]);
	});

	test("preserves the order of non-entry modules", async ({ expect }) => {
		const result = await getModulesFromManifest(
			await createBundle({
				"index.js": { type: "esm" },
				"a.bin": { type: "data" },
				"b.txt": { type: "text" },
				"c.wasm": { type: "wasm" },
			})
		);

		expect(Object.keys(result.modules)).toEqual([
			"index.js",
			"a.bin",
			"b.txt",
			"c.wasm",
		]);
	});

	test("preserves Build Output Specification module types", async ({
		expect,
	}) => {
		const result = await getModulesFromManifest(
			await createBundle({
				"index.js": { type: "esm" },
				"data.bin": { type: "data" },
				"text.txt": { type: "text" },
				"compiled.wasm": { type: "wasm" },
				"data.json": { type: "json" },
			})
		);

		expect(
			Object.fromEntries(
				Object.entries(result.modules).map(([modulePath, { type }]) => [
					modulePath,
					type,
				])
			)
		).toEqual({
			"index.js": "esm",
			"data.bin": "data",
			"text.txt": "text",
			"compiled.wasm": "wasm",
			"data.json": "json",
		});
	});

	test("reads module contents", async ({ expect }) => {
		const result = await getModulesFromManifest(
			await createBundle({
				"index.js": { type: "esm", contents: "export default {}" },
				"text.txt": { type: "text", contents: "hello" },
			})
		);

		expect(
			moduleContentsToString(result.modules["index.js"]?.contents ?? "")
		).toBe("export default {}");
		expect(
			moduleContentsToString(result.modules["text.txt"]?.contents ?? "")
		).toBe("hello");
	});

	test("excludes sourcemap modules from the runtime manifest", async ({
		expect,
	}) => {
		const result = await getModulesFromManifest(
			await createBundle({
				"index.js": { type: "esm" },
				"index.js.map": { type: "sourcemap" },
			})
		);

		expect(Object.keys(result.modules)).toEqual(["index.js"]);
	});

	test("passes `rootPath` through unchanged", async ({ expect }) => {
		const bundle = await createBundle({ "index.js": { type: "esm" } });
		const result = await getModulesFromManifest(bundle);

		expect(result.rootPath).toBe(bundle.rootPath);
	});

	test("throws when `mainModule` is missing from `modules`", async ({
		expect,
	}) => {
		await expect(
			getModulesFromManifest(
				await createBundle({ "index.js": { type: "esm" } }, "missing.js")
			)
		).rejects.toThrow(/`mainModule` "missing\.js" is missing from `modules`/);
	});
});
