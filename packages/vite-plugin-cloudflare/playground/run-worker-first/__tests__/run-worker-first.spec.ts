import { describe, expect, test } from "vitest";
import { failsIf, isBuild, page, viteTestUrl } from "../../__test-utils__";

describe("run_worker_first support", () => {
	test("returns the correct home page", async () => {
		const content = await page.textContent("h1");
		expect(content).toBe("Vite + React");
	});

	test("returns the response from the API", async () => {
		const button = page.getByRole("button", { name: "get-name" });
		const contentBefore = await button.innerText();
		expect(contentBefore).toBe("Name from API is: unknown");
		const responsePromise = page.waitForResponse((response) =>
			response.url().endsWith("/api/")
		);
		await button.click();
		await responsePromise;
		const contentAfter = await button.innerText();
		expect(contentAfter).toBe("Name from API is: Cloudflare");
	});

	test("returns UNAUTH for the admin page", async () => {
		const response = await fetch(viteTestUrl + "/admin");
		expect(response.status).toBe(401);
	});

	// This is the only use case that is not currently supported in dev mode.
	// In that mode the middleware that runs the Worker is after the built-in Vite middleware that handles the assets.
	failsIf(!isBuild)("returns UNAUTH for an admin image", async () => {
		const response = await fetch(viteTestUrl + "/admin/secret.svg");
		expect(response.status).toBe(401);
	});

	test("returns response for authorized admin page", async () => {
		const response = await fetch(viteTestUrl + "/admin?auth=xxx");
		expect(response.status).toBe(200);
	});

	test("returns response for authorized admin image", async () => {
		const response = await fetch(viteTestUrl + "/admin/secret.svg?auth=xxx");
		expect(response.status).toBe(200);
	});
});
