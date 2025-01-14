import { describe, expect, test } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	viteTestUrl,
} from "../../../__test-utils__";

// TODO: test build
describe.runIf(!isBuild)("module resolution without prebundling", async () => {
	test("importing a non-prebundled `@cloudflare-dev-module-resolution/requires/no-ext`", async () => {
		await page.goto(`${viteTestUrl}/require-no-ext`);
		const errorText = await page
			.locator("vite-error-overlay pre.message")
			.textContent();
		expect(errorText).toMatch(
			/^\[Error\] Trying to import non-prebundled module \(only prebundled modules are allowed\):/
		);
		expect(errorText).toContain("/no-ext");
	});

	test("importing a non-prebundled `@cloudflare-dev-module-resolution/requires/ext`", async () => {
		await page.goto(`${viteTestUrl}/require-ext`);
		const errorText = await page
			.locator("vite-error-overlay pre.message")
			.textContent();
		expect(errorText).toMatch(
			/^\[Error\] Trying to import non-prebundled module \(only prebundled modules are allowed\):/
		);
		expect(errorText).toContain("/ext");
	});

	test("importing a non-prebundled `react`", async () => {
		await page.goto(`${viteTestUrl}/third-party/react`);
		const errorText = await page
			.locator("vite-error-overlay pre.message")
			.textContent();
		expect(errorText).toMatch(
			/^\[Error\] Trying to import non-prebundled module \(only prebundled modules are allowed\):/
		);
		expect(errorText).toContain("react");
	});

	describe("user aliases", () => {
		test("imports from an aliased package", async () => {
			const result = await getTextResponse("/@alias/test");
			expect(result).toBe("OK!");
		});
	});
});
