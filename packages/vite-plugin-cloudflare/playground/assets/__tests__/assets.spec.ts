import { expect, test } from "vitest";
import { page, viteTestUrl } from "../../__test-utils__";
import "./base-tests";

test("fetches transformed HTML asset", async () => {
	await page.goto(`${viteTestUrl}/transformed-html-asset`);
	const content = await page.textContent("h1");
	expect(content).toBe("Modified content");
});
