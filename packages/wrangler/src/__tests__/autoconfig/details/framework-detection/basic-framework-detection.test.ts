import { writeFile } from "node:fs/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../../autoconfig/details/framework-detection";
describe("detectFramework() / basic framework detection", () => {
	runInTempDir();

	it("defaults to the static framework when no framework is detected", async ({
		expect,
	}) => {
		await writeFile(
			"package-lock.json",
			JSON.stringify({ lockfileVersion: 3 })
		);

		const result = await detectFramework(process.cwd());

		expect(result.detectedFramework.framework.id).toBe("static");
	});

	it("detects astro when astro is in dependencies", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd());

		expect(result.detectedFramework?.framework.id).toBe("astro");
		expect(result.detectedFramework?.framework.name).toBe("Astro");
	});

	it("detects vite from package.json when no framework is otherwise detected", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				scripts: {
					build: "tsc && vite build",
				},
				devDependencies: {
					vite: "^8.0.12",
				},
			}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd());

		expect(result.detectedFramework?.framework.id).toBe("vite");
		expect(result.detectedFramework?.framework.name).toBe("Vite");
		expect(result.detectedFramework?.buildCommand).toBe("npm run build");
		expect(result.detectedFramework?.dist).toBe("dist");
	});

	it("includes buildCommand in detectedFramework when available", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd());

		expect(result.detectedFramework?.buildCommand).toBeDefined();
		expect(result.detectedFramework?.buildCommand).toContain("astro build");
	});
});
