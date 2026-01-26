import { resolve } from "node:path";
import { toMatchImageSnapshot } from "jest-image-snapshot";
import { Browser, chromium } from "playwright-chromium";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("Workers + Assets + SPA", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;
	let browser: Browser | undefined;

	beforeAll(async () => {
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0"]
		));

		browser = await chromium.launch({
			headless: !process.env.VITE_DEBUG_SERVE,
			args: process.env.CI
				? ["--no-sandbox", "--disable-setuid-sandbox"]
				: undefined,
		});
	});

	afterAll(async () => {
		await stop?.();
		await browser?.close();
	});

	it("renders the homepage in a browser correctly", async () => {
		expect.extend({ toMatchImageSnapshot });

		if (!browser) {
			throw new Error("Browser couldn't be initialized");
		}

		const page = await browser.newPage({
			baseURL: `http://${ip}:${port}`,
		});
		await page.goto("/");
		if (process.platform === "darwin") {
			// different platforms render the page differently (fonts?)
			expect(await page.screenshot()).toMatchImageSnapshot();
		}

		const mathResultLocator = page.getByText("1 + 1 = 2");
		await mathResultLocator.waitFor({ state: "attached" });
		expect(await mathResultLocator.getAttribute("id")).toBe(`math-result`);

		const jsonResultLocator = page.getByText(
			JSON.stringify({ hello: "world" }, null, 2)
		);
		await jsonResultLocator.waitFor({ state: "attached" });
		expect(await jsonResultLocator.getAttribute("id")).toBe(`json-result`);

		const htmlResultLocator = page.getByText("Hello, world!");
		await htmlResultLocator.waitFor({ state: "attached" });
		const parentHtmlResultLocator = htmlResultLocator.locator("..");
		expect(await parentHtmlResultLocator.getAttribute("id")).toBe(
			"html-result"
		);
	});

	it("navigates soft page navigations correctly", async () => {
		if (!browser) {
			throw new Error("Browser couldn't be initialized");
		}

		const page = await browser.newPage({
			baseURL: `http://${ip}:${port}`,
		});
		await page.goto("/");

		const homepageLink = page.getByText("/ HARD SOFT").getByText("SOFT");
		expect(await homepageLink.getAttribute("href")).toBe("/");
		await homepageLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/`);
		const homepageHeader = page.getByRole("heading", { name: "Homepage" });
		await homepageHeader.waitFor({ state: "attached" });

		const blogLink = page.getByText("/blog HARD SOFT").getByText("SOFT");
		expect(await blogLink.getAttribute("href")).toBe("/blog");
		await blogLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/blog`);
		const blogTitleLocator = page.getByRole("heading", { name: "Blog" });
		await blogTitleLocator.waitFor({ state: "attached" });

		const blogSlugInput = page.getByRole("textbox");
		blogSlugInput.fill("/blog/some-slug-here");

		const blogSlugLink = page.getByRole("button", { name: "SOFT load" });
		await blogSlugLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/blog/some-slug-here`);
		const blogSlugTitleLocator = page.getByRole("heading", {
			name: "Blog | some-slug-here",
		});
		await blogSlugTitleLocator.waitFor({ state: "attached" });

		const blogRandomLink = page
			.getByText("/blog/random HARD SOFT")
			.getByText("SOFT");
		expect(await blogRandomLink.getAttribute("href")).toBe("/blog/random");
		await blogRandomLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/blog/random`);
		const blogRandomTitleLocator = page.getByRole("heading", {
			name: "Blog | random",
		});
		await blogRandomTitleLocator.waitFor({ state: "attached" });

		const shadowedByAssetLink = page
			.getByText("/shadowed-by-asset.txt HARD SOFT")
			.getByText("SOFT");
		expect(await shadowedByAssetLink.getAttribute("href")).toBe(
			"/shadowed-by-asset.txt"
		);
		await shadowedByAssetLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/shadowed-by-asset.txt`);
		const shadowedByAssetHeader = page.getByRole("heading", {
			name: "404 page!",
		});
		await shadowedByAssetHeader.waitFor({ state: "attached" });

		const shadowedBySpaLink = page
			.getByText("/shadowed-by-spa HARD SOFT")
			.getByText("SOFT");
		expect(await shadowedBySpaLink.getAttribute("href")).toBe(
			"/shadowed-by-spa"
		);
		await shadowedBySpaLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/shadowed-by-spa`);
		const shadowedBySpaHeader = page.getByRole("heading", {
			name: "Shadowed by SPA!",
		});
		await shadowedBySpaHeader.waitFor({ state: "attached" });

		const mathLink = page.getByText("/api/math HARD SOFT").getByText("SOFT");
		expect(await mathLink.getAttribute("href")).toBe("/api/math");
		await mathLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/api/math`);
		const mathHeader = page.getByRole("heading", {
			name: "404 page!",
		});
		await mathHeader.waitFor({ state: "attached" });
	});

	it("navigates hard navigations correctly", async () => {
		if (!browser) {
			throw new Error("Browser couldn't be initialized");
		}

		const page = await browser.newPage({
			baseURL: `http://${ip}:${port}`,
		});
		await page.goto("/");

		const homepageLink = page.getByText("/ HARD SOFT").getByText("HARD");
		expect(await homepageLink.getAttribute("href")).toBe("/");
		await homepageLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/`);
		const homepageHeader = page.getByRole("heading", { name: "Homepage" });
		await homepageHeader.waitFor({ state: "attached" });

		const blogLink = page.getByText("/blog HARD SOFT").getByText("HARD");
		expect(await blogLink.getAttribute("href")).toBe("/blog");
		await blogLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/blog`);
		const blogTitleLocator = page.getByRole("heading", { name: "Blog" });
		await blogTitleLocator.waitFor({ state: "attached" });

		expect(
			getOutput().match(
				/GET \/blog 200 OK \(.*\) `Sec-Fetch-Mode: navigate` header present - using `not_found_handling` behavior/
			)
		).toBeTruthy();

		const blogSlugInput = page.getByRole("textbox");
		blogSlugInput.fill("/blog/some-slug-here");

		const blogSlugLink = page.getByRole("link", { name: "HARD load" });
		await blogSlugLink.click();
		expect(page.url()).toBe(`http://${ip}:${port}/blog/some-slug-here`);
		const blogSlugTitleLocator = page.getByRole("heading", {
			name: "Blog | some-slug-here",
		});
		await blogSlugTitleLocator.waitFor({ state: "attached" });

		const blogRandomLink = page
			.getByText("/blog/random HARD SOFT")
			.getByText("HARD");
		expect(await blogRandomLink.getAttribute("href")).toBe("/blog/random");
		await blogRandomLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/blog/random`);
		const blogRandomTitleLocator = page.getByRole("heading", {
			name: "Blog | random",
		});
		await blogRandomTitleLocator.waitFor({ state: "attached" });

		const shadowedByAssetLink = page
			.getByText("/shadowed-by-asset.txt HARD SOFT")
			.getByText("HARD");
		expect(await shadowedByAssetLink.getAttribute("href")).toBe(
			"/shadowed-by-asset.txt"
		);
		await shadowedByAssetLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/shadowed-by-asset.txt`);
		expect(await page.content()).toContain("i'm some text!");

		await page.goBack();

		const shadowedBySpaLink = page
			.getByText("/shadowed-by-spa HARD SOFT")
			.getByText("HARD");
		expect(await shadowedBySpaLink.getAttribute("href")).toBe(
			"/shadowed-by-spa"
		);
		await shadowedBySpaLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/shadowed-by-spa`);
		const shadowedBySpaHeader = page.getByRole("heading", {
			name: "Shadowed by SPA!",
		});
		await shadowedBySpaHeader.waitFor({ state: "attached" });

		const mathLink = page.getByText("/api/math HARD SOFT").getByText("HARD");
		expect(await mathLink.getAttribute("href")).toBe("/api/math");
		await mathLink.click();

		expect(page.url()).toBe(`http://${ip}:${port}/api/math`);
		const mathHeader = page.getByRole("heading", {
			name: "404 page!",
		});
		await mathHeader.waitFor({ state: "attached" });
	});

	it("direct fetches don't look like SPA requests", async () => {
		const homepageResponse = await fetch(`http://${ip}:${port}/`);
		expect(await homepageResponse.text()).toContain("Homepage");

		const blogResponse = await fetch(`http://${ip}:${port}/blog`);
		expect(await blogResponse.text()).toBe("nope");

		const shadowedByAssetResponse = await fetch(
			`http://${ip}:${port}/shadowed-by-asset.txt`
		);
		expect(await shadowedByAssetResponse.text()).toBe("i'm some text!");

		const mathResponse = await fetch(`http://${ip}:${port}/api/math`);
		expect(await mathResponse.text()).toBe("1 + 1 = 2");
	});
});
