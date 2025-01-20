import { expect, test } from "vitest";
import { page, viteTestUrl } from "../../__test-utils__";

test("returns the correct home page", async () => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

test("allows updating state", async () => {
	const button = page.getByRole("button", { name: "increment" });
	const contentBefore = await button.innerText();
	expect(contentBefore).toBe("count is 0");
	await button.click();
	const contentAfter = await button.innerText();
	expect(contentAfter).toBe("count is 1");
});

test("returns the home page for not found routes", async () => {
	await page.goto(`${viteTestUrl}/random-page`);
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});
