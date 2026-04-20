import { join } from "node:path";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { detectFramework } from "../../../../autoconfig/details/framework-detection";
import * as configCache from "../../../../config-cache";
import * as isInteractiveModule from "../../../../is-interactive";
import { PAGES_CONFIG_CACHE_FILENAME } from "../../../../pages/constants";
import { mockConfirm } from "../../../helpers/mock-dialogs";
import { runInTempDir } from "../../../helpers/run-in-tmp";
import type { Config } from "@cloudflare/workers-utils";
import type { MockInstance } from "vitest";

describe("detectFramework() / Pages project detection", () => {
	runInTempDir();
	let isNonInteractiveOrCISpy: MockInstance;

	beforeEach(() => {
		isNonInteractiveOrCISpy = vi
			.spyOn(isInteractiveModule, "isNonInteractiveOrCI")
			.mockReturnValue(false);
	});

	afterEach(() => {
		isNonInteractiveOrCISpy.mockRestore();
	});

	it("returns Cloudflare Pages framework when pages_build_output_dir is set in wrangler config", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd(), {
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
			[join(cacheFolder, PAGES_CONFIG_CACHE_FILENAME)]: JSON.stringify({
				account_id: "test-account",
			}),
		});

		const getCacheFolderSpy = vi
			.spyOn(configCache, "getCacheFolder")
			.mockReturnValue(cacheFolder);

		try {
			const result = await detectFramework(process.cwd());

			expect(result.detectedFramework?.framework.id).toBe("cloudflare-pages");
			expect(result.detectedFramework?.framework.name).toBe("Cloudflare Pages");
		} finally {
			getCacheFolderSpy.mockRestore();
		}
	});

	it("returns Cloudflare Pages when a functions/ directory exists, no framework is detected, and the user confirms", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			"functions/hello.js": `export function onRequest() { return new Response("hi"); }`,
		});

		mockConfirm({
			text: "We have identified a `functions` directory in this project, which might indicate you have an active Cloudflare Pages deployment. Is this correct?",
			result: true,
		});

		const result = await detectFramework(process.cwd());

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

		mockConfirm({
			text: "We have identified a `functions` directory in this project, which might indicate you have an active Cloudflare Pages deployment. Is this correct?",
			result: false,
		});

		const result = await detectFramework(process.cwd());

		expect(result.detectedFramework?.framework.id).not.toBe("cloudflare-pages");
	});

	it("does not return Cloudflare Pages when a functions/ directory exists alongside a detected framework", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"functions/hello.js": `export function onRequest() { return new Response("hi"); }`,
		});

		const result = await detectFramework(process.cwd());

		// Astro is detected, so Pages detection via functions/ is skipped
		expect(result.detectedFramework?.framework.id).not.toBe("cloudflare-pages");
		expect(result.detectedFramework?.framework.id).toBe("astro");
	});
});
