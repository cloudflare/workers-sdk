import { join } from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { detectFramework } from "../../../src/details/framework-detection";
import { createMockContext } from "../../helpers/mock-context";
import type { Config } from "@cloudflare/workers-utils";

describe("detectFramework() / Pages project detection", () => {
	runInTempDir();
	const context = createMockContext();

	it("returns Cloudflare Pages framework when pages_build_output_dir is set in wrangler config", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd(), context, {
			pages_build_output_dir: "./dist",
		} as Config);

		expect(result.detectedFramework?.framework.id).toBe("cloudflare-pages");
		expect(result.detectedFramework?.framework.name).toBe("Cloudflare Pages");
		expect(result.detectedFramework?.dist).toBe("./dist");
	});

	it("returns Cloudflare Pages framework when the pages cache file exists", async ({
		expect,
	}) => {
		const cacheFolder = join(process.cwd(), ".cache");
		await seed({
			"package.json": JSON.stringify({}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			[join(cacheFolder, "pages.json")]: JSON.stringify({
				account_id: "test-account",
			}),
		});

		const cacheContext = createMockContext({
			getCacheFolder: () => cacheFolder,
		});

		const result = await detectFramework(process.cwd(), cacheContext);

		expect(result.detectedFramework?.framework.id).toBe("cloudflare-pages");
		expect(result.detectedFramework?.framework.name).toBe("Cloudflare Pages");
	});

	it("returns Cloudflare Pages when a functions/ directory exists, no framework is detected, and the user confirms", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			"functions/hello.js": `export function onRequest() { return new Response("hi"); }`,
		});

		const confirmContext = createMockContext({
			dialogs: {
				confirm: vi.fn().mockResolvedValue(true),
				prompt: vi.fn().mockResolvedValue(""),
				select: vi.fn().mockResolvedValue(""),
			},
		});

		const result = await detectFramework(process.cwd(), confirmContext);

		expect(result.detectedFramework?.framework.id).toBe("cloudflare-pages");
		expect(result.detectedFramework?.framework.name).toBe("Cloudflare Pages");
	});

	it("does not return Cloudflare Pages when the user denies the functions/ directory prompt", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			"functions/hello.js": `export function onRequest() { return new Response("hi"); }`,
		});

		const denyContext = createMockContext({
			dialogs: {
				confirm: vi.fn().mockResolvedValue(false),
				prompt: vi.fn().mockResolvedValue(""),
				select: vi.fn().mockResolvedValue(""),
			},
		});

		const result = await detectFramework(process.cwd(), denyContext);

		expect(result.detectedFramework?.framework.id).not.toBe("cloudflare-pages");
	});

	it("does not return Cloudflare Pages when a functions/ directory exists alongside a detected framework", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"functions/hello.js": `export function onRequest() { return new Response("hi"); }`,
		});

		const result = await detectFramework(process.cwd(), context);

		// Astro is detected, so Pages detection via functions/ is skipped
		expect(result.detectedFramework?.framework.id).not.toBe("cloudflare-pages");
		expect(result.detectedFramework?.framework.id).toBe("astro");
	});
});
