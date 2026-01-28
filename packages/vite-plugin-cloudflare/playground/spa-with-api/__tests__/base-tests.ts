import { expect, test, vi } from "vitest";
import { page, WAIT_FOR_OPTIONS } from "../../__test-utils__";

test("returns the correct home page", async () => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

test("returns the response from the API", async () => {
	const button = page.getByRole("button", { name: "get-name" });
	const contentBefore = await button.innerText();
	expect(contentBefore).toBe("Name from API is: unknown");
	await button.click();
	await vi.waitFor(async () => {
		const contentAfter = await button.innerText();
		expect(contentAfter).toBe("Name from API is: Cloudflare");
	}, WAIT_FOR_OPTIONS);
});
