import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAssetsIgnoreFunction, getContentType } from "../helpers";

describe("assets", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "wrangler-tests"));

	describe(".assetsignore", () => {
		it("should ignore metafiles by default", async () => {
			const { assetsIgnoreFunction } = await createAssetsIgnoreFunction(tmpDir);

			expect(assetsIgnoreFunction(".assetsignore")).toBeTruthy();
			expect(assetsIgnoreFunction("_redirects")).toBeTruthy();
			expect(assetsIgnoreFunction("_headers")).toBeTruthy();

			// don't ignore metafiles in child directories
			expect(assetsIgnoreFunction(join("child", ".assetsignore"))).toBeFalsy();
			expect(assetsIgnoreFunction(join("child", "_redirects"))).toBeFalsy();
			expect(assetsIgnoreFunction(join("child", "_headers"))).toBeFalsy();
		});

		it("should allow users to force opt-in metafiles", async () => {
			await writeFile(
				join(tmpDir, "./.assetsignore"),
				"!.assetsignore\n!_redirects\n!_headers"
			);
			const { assetsIgnoreFunction } = await createAssetsIgnoreFunction(tmpDir);

			expect(assetsIgnoreFunction(".assetsignore")).toBeFalsy();
			expect(assetsIgnoreFunction("_redirects")).toBeFalsy();
			expect(assetsIgnoreFunction("_headers")).toBeFalsy();
		});

		it("should allow users to ignore files", async () => {
			await writeFile(
				join(tmpDir, "./.assetsignore"),
				"logo.png\nchild/**/*.svg\n!child/nope.svg\n/*.js"
			);
			const { assetsIgnoreFunction } = await createAssetsIgnoreFunction(tmpDir);

			expect(assetsIgnoreFunction("abc")).toBeFalsy();
			expect(assetsIgnoreFunction("logo.png")).toBeTruthy();
			expect(assetsIgnoreFunction(join("child", "logo.png"))).toBeTruthy();
			expect(assetsIgnoreFunction("foo.js")).toBeTruthy();
			expect(assetsIgnoreFunction(join("child", "foo.js"))).toBeFalsy();
			expect(assetsIgnoreFunction(join("child", "yup.svg"))).toBeTruthy();
			expect(
				assetsIgnoreFunction(join("child", "a", "b", "c", "yup.svg"))
			).toBeTruthy();
			expect(assetsIgnoreFunction(join("child", "nope.svg"))).toBeFalsy();
		});
	});
});

describe("getContentType", () => {
	it("should return 'text/javascript", () => {
		const contentType = getContentType("/_astro/sponsors.CIiPz7eJ.js");
		expect(contentType).toBe("text/javascript; charset=utf-8");
	});
});
