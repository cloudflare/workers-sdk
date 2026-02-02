import { expect, test } from "vitest";
import { page } from "../../__test-utils__";

export const browserMode = true;

test("returns the correct home page", async () => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + TypeScript");
});
