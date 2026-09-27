import { writeFile } from "node:fs/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../src/details/framework-detection";
import { createMockContext } from "../../helpers/mock-context";

describe("detectFramework() / basic framework detection", () => {
	runInTempDir();
	const context = createMockContext();

	it("defaults to the static framework when no framework is detected", async ({
		expect,
	}) => {
		await writeFile(
			"package-lock.json",
			JSON.stringify({ lockfileVersion: 3 })
		);

		const result = await detectFramework(process.cwd(), context);

		expect(result.detectedFramework.framework.id).toBe("static");
	});

	it("detects astro when astro is in dependencies", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.detectedFramework?.framework.id).toBe("astro");
		expect(result.detectedFramework?.framework.name).toBe("Astro");
	});

	it("includes buildCommand in detectedFramework when available", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.detectedFramework?.buildCommand).toBeDefined();
		expect(result.detectedFramework?.buildCommand).toContain("astro build");
	});

	it("clears commands for an unknown framework when targeting cf", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				scripts: { build: "cf build", dev: "cf dev" },
				dependencies: { gatsby: "5" },
			}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.detectedFramework).toMatchObject({
			framework: { id: "gatsby" },
			buildCommand: undefined,
			devCommand: undefined,
		});
	});

	it("preserves command inference for an unsupported framework when targeting Wrangler", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				scripts: { build: "cf build", dev: "cf dev" },
				dependencies: { hono: "4", vite: "8" },
			}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd(), context, {
			target: "wrangler",
		});

		expect(result.detectedFramework).toMatchObject({
			framework: { id: "hono" },
			buildCommand: "npm run build",
			devCommand: undefined,
		});
	});
});
