import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("Workers + Assets + SPA", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0"]
		));
	});

	async function fetchText(path: string = "/", init: RequestInit = {}) {
		const response = await fetch(`http://${ip}:${port}${path}`, init);
		return await response.text();
	}

	afterAll(async () => {
		await stop?.();
	});

	it("renders the homepage in a browser correctly", async ({ expect }) => {
		expect(
			await fetchText("/", {
				headers: {
					"X-MF-Sec-Fetch-Mode": "navigate",
				},
			})
		).toContain("<title>I'm a SPA</title>");
	});

	it("navigates hard navigations correctly", async ({ expect }) => {
		expect(
			await fetchText("/", {
				headers: {
					"X-MF-Sec-Fetch-Mode": "navigate",
				},
			})
		).toContain("<title>I'm a SPA</title>");

		expect(
			await fetchText("/blog", {
				headers: {
					"X-MF-Sec-Fetch-Mode": "navigate",
				},
			})
		).toContain("<title>I'm a SPA</title>");

		expect(
			getOutput().match(
				/GET \/blog 200 OK \(.*\) `Sec-Fetch-Mode: navigate` header present - using `not_found_handling` behavior/
			)
		).toBeTruthy();

		expect(
			await fetchText("/shadowed-by-asset.txt", {
				headers: {
					"X-MF-Sec-Fetch-Mode": "navigate",
				},
			})
		).toBe("i'm some text!");

		expect(
			await fetchText("/shadowed-by-spa", {
				headers: {
					"X-MF-Sec-Fetch-Mode": "navigate",
				},
			})
		).toContain("<title>I'm a SPA</title>");

		expect(
			await fetchText("/api/math", {
				headers: {
					"X-MF-Sec-Fetch-Mode": "navigate",
				},
			})
		).toContain("<title>I'm a SPA</title>");
	});

	it("direct fetches don't look like SPA requests", async ({ expect }) => {
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
