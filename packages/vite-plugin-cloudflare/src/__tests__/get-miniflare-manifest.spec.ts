import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test } from "vitest";
import { getMiniflareManifest } from "../miniflare-options";

describe("getMiniflareManifest", () => {
	let rootPath: string;

	beforeEach(() => {
		rootPath = mkdtempSync(path.join(tmpdir(), "vite-plugin-manifest-"));
		mkdirSync(path.join(rootPath, "assets"));
		writeFileSync(path.join(rootPath, "index.js"), "export default {};");
		writeFileSync(path.join(rootPath, "assets/data.bin"), Buffer.from([0, 1]));
		writeFileSync(path.join(rootPath, "assets/text.txt"), "hello");
		writeFileSync(path.join(rootPath, "index.js.map"), "{}");
	});

	afterEach(() => removeDirSync(rootPath));

	test("creates a native Miniflare manifest with module contents", async ({
		expect,
	}) => {
		const result = await getMiniflareManifest({
			rootPath,
			mainModule: "index.js",
			modules: {
				"assets/data.bin": { type: "data" },
				"index.js": { type: "esm" },
				"assets/text.txt": { type: "text" },
				"index.js.map": { type: "sourcemap" },
			},
		});

		expect(result).toEqual({
			mainModule: "index.js",
			modulesRoot: rootPath,
			modules: {
				"assets/data.bin": {
					type: "data",
					contents: new Uint8Array([0, 1]),
				},
				"index.js": { type: "esm", contents: "export default {};" },
				"assets/text.txt": { type: "text", contents: "hello" },
				"index.js.map": { type: "sourcemap", contents: "{}" },
			},
		});
	});

	test("throws when mainModule is missing from modules", async ({ expect }) => {
		await expect(
			getMiniflareManifest({
				rootPath,
				mainModule: "missing.js",
				modules: { "index.js": { type: "esm" } },
			})
		).rejects.toThrow(/`mainModule` "missing\.js" is missing from `modules`/);
	});
});
