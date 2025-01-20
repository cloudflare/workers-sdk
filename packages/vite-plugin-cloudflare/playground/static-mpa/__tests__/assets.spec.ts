import { expect, test } from "vitest";
import { page, serverLogs, viteTestUrl } from "../../__test-utils__";

test("returns the correct home page", async () => {
	const content = await page.textContent("h1");
	expect(content).toBe("Home");
});

test("returns the correct contact page", async () => {
	await page.goto(`${viteTestUrl}/contact`);
	const content = await page.textContent("h1");
	expect(content).toBe("Contact");
});

test("returns the correct about page", async () => {
	await page.goto(`${viteTestUrl}/about`);
	const content = await page.textContent("h1");
	expect(content).toBe("About");
});

test("returns the correct canonical URL", async () => {
	await page.goto(`${viteTestUrl}/about`);
	const url = page.url();
	expect(url).toBe(`${viteTestUrl}/about/`);
});

test("returns the correct root 404 page", async () => {
	await page.goto(`${viteTestUrl}/random-page`);
	const content = await page.textContent("h1");
	expect(content).toBe("Root 404");
});

test("returns the correct nested 404 page", async () => {
	await page.goto(`${viteTestUrl}/about/random-page`);
	const content = await page.textContent("h1");
	expect(content).toBe("About 404");
});

test("worker configs warnings are not present in the terminal", async () => {
	expect(serverLogs.warns).toEqual([]);
});
