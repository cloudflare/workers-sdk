import { test, vi } from "vitest";
import { page, WAIT_FOR_OPTIONS } from "../../__test-utils__";

export function runBaseTests() {
	test("returns the correct home page", async ({ expect }) => {
		const content = await page.textContent("h1");
		expect(content).toBe("Vite + React");
	});

	test("returns the response from the API", async ({ expect }) => {
		const button = page.getByRole("button", { name: "get-name" });
		const contentBefore = await button.innerText();
		expect(contentBefore).toBe("Name from API is: unknown");
		// The outer `waitFor` re-clicks in case the initial-build `full-reload`
		// under `experimental.bundledDev` resets the SPA state and discards an
		// earlier click. The inner `waitFor` then waits for the API response after
		// each click so latency is tolerated.
		await vi.waitFor(async () => {
			await button.click();
			await vi.waitFor(
				async () => {
					const contentAfter = await button.innerText();
					expect(contentAfter).toBe("Name from API is: Cloudflare");
				},
				{ timeout: 1_000, interval: 100 }
			);
		}, WAIT_FOR_OPTIONS);
	});
}
