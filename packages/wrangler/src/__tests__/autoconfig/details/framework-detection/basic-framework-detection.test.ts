import { writeFile } from "node:fs/promises";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../../autoconfig/details/framework-detection";
import { runInTempDir } from "../../../helpers/run-in-tmp";

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
