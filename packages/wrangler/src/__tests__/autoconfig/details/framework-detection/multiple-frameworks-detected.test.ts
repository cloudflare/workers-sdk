import { seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { detectFramework } from "../../../../autoconfig/details/framework-detection";
import * as isInteractiveModule from "../../../../is-interactive";
import { runInTempDir } from "../../../helpers/run-in-tmp";
import type { MockInstance } from "vitest";

describe("detectFramework() / multiple frameworks detected", () => {
	runInTempDir();
	let isNonInteractiveOrCISpy: MockInstance;

	beforeEach(() => {
		isNonInteractiveOrCISpy = vi
			.spyOn(isInteractiveModule, "isNonInteractiveOrCI")
			.mockReturnValue(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		isNonInteractiveOrCISpy.mockRestore();
	});

	describe("non-CI environment", () => {
		beforeEach(() => {
			isNonInteractiveOrCISpy.mockReturnValue(false);
		});

		it("returns the known framework when multiple are detected but only one is known", async ({
			expect,
		}) => {
			// gatsby is not in allKnownFrameworks, only astro is
			await seed({
				"package.json": JSON.stringify({
					dependencies: { astro: "5", gatsby: "5" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			const result = await detectFramework(process.cwd());

			expect(result.detectedFramework?.framework.id).toBe("astro");
		});

		it("filters out Vite and returns the other known framework", async ({
			expect,
		}) => {
			await seed({
				"package.json": JSON.stringify({
					dependencies: { next: "14", vite: "5" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			const result = await detectFramework(process.cwd());

			expect(result.detectedFramework?.framework.id).toBe("next");
		});

		it("returns Waku (not Hono) when both Waku and Hono are detected", async ({
			expect,
		}) => {
			await seed({
				"package.json": JSON.stringify({
					dependencies: { waku: "0.21", hono: "4" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			const result = await detectFramework(process.cwd());

			expect(result.detectedFramework?.framework.id).toBe("waku");
		});

		it("returns first framework without throwing when multiple unknown frameworks are detected", async ({
			expect,
		}) => {
			// Both gatsby and gridsome are unknown to wrangler
			await seed({
				"package.json": JSON.stringify({
					dependencies: { gatsby: "5", gridsome: "1" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			// Should not throw even with multiple unknowns in non-CI mode
			await expect(detectFramework(process.cwd())).resolves.toBeDefined();
		});
	});

	describe("CI environment", () => {
		beforeEach(() => {
			isNonInteractiveOrCISpy.mockReturnValue(true);
		});

		it("throws MultipleFrameworksCIError when multiple known frameworks are detected", async ({
			expect,
		}) => {
			await seed({
				"package.json": JSON.stringify({
					dependencies: { astro: "5", nuxt: "3" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			await expect(
				detectFramework(process.cwd())
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
					[Error: Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found: Astro, Nuxt.

					To fix this issue either:
					  - check your project's configuration to make sure that the target framework
					    is the only configured one and try again
					  - run \`wrangler setup\` locally to get an interactive user experience where
					    you can specify what framework you want to target
					]
				`
			);
		});

		it("throws MultipleFrameworksCIError when multiple unknown frameworks are detected", async ({
			expect,
		}) => {
			await seed({
				"package.json": JSON.stringify({
					dependencies: { gatsby: "5", gridsome: "1" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			await expect(detectFramework(process.cwd())).rejects.toThrowError(
				/Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found/
			);
		});

		it("does not throw when Vite and another known framework are detected (Vite is filtered out)", async ({
			expect,
		}) => {
			await seed({
				"package.json": JSON.stringify({
					dependencies: { astro: "5", vite: "5" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			const result = await detectFramework(process.cwd());

			expect(result.detectedFramework?.framework.id).toBe("astro");
		});

		it("does not throw when Hono and another known framework are detected (Hono is filtered out)", async ({
			expect,
		}) => {
			await seed({
				"package.json": JSON.stringify({
					dependencies: { "@tanstack/react-start": "1.132.0", hono: "4" },
				}),
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});

			const result = await detectFramework(process.cwd());

			expect(result.detectedFramework?.framework.id).toBe("tanstack-start");
		});
	});
});
