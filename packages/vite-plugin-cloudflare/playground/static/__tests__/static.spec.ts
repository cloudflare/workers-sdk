import { test } from "vitest";
import { page, viteTestUrl } from "../../__test-utils__";

test("returns the correct home page", async ({ expect }) => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + TypeScript");
});

test("transforms images via /cdn-cgi/image/", async ({ expect }) => {
	const response = await fetch(
		`${viteTestUrl}/cdn-cgi/image/width=100,format=webp/image.png`
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("image/webp");
	expect(response.headers.get("cf-resized")).toBe("internal=ok/m");
	await response.arrayBuffer();
});
