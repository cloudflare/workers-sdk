import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";
import type { TestOptions } from "vitest";

const BROWSER_RENDERING_RETRY = {
	retry: {
		condition: /Chrome readiness probe .* timed out|Test timed out/i,
		count: 3,
		delay: 1_000,
	},
} satisfies TestOptions;

describe("Local Browser quick actions", { concurrent: false }, () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--local",
			"--port=0",
			"--inspector-port=0",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	async function fetchOk(url: string) {
		const response = await fetch(url, {
			headers: {
				"MF-Disable-Pretty-Error": "1",
			},
		});
		if (!response.ok) {
			// Keep the full error available to the targeted retry condition.
			// Assertion errors truncate long response bodies before matching it.
			const error = new Error(
				`Browser request failed (${response.status}): ${await response.text()}`
			);
			console.error(error.message);
			throw error;
		}

		return response;
	}

	async function fetchText(url: string) {
		return (await fetchOk(url)).text();
	}

	const html = encodeURIComponent("<title>Quick action</title><h1>Hello</h1>");

	it("Doesn't run a browser, just testing that the worker is running!", async ({
		expect,
	}) => {
		expect(await fetchText(`http://${ip}:${port}/`)).toEqual(
			"Please add an ?url=https://example.com/ or ?html=<h1>Hello</h1> parameter"
		);
	});

	it(
		"converts a page to Markdown",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const body = JSON.parse(
				await fetchText(`http://${ip}:${port}/?action=markdown&html=${html}`)
			);
			expect(body).toEqual({
				success: true,
				result: '---\ntitle: "Quick action"\n---\n\n# Hello',
				meta: { status: 200, title: "Quick action" },
			});
		}
	);

	it(
		"scrapes the requested selector",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const body = JSON.parse(
				await fetchText(
					`http://${ip}:${port}/?action=scrape&selector=h1&html=${html}`
				)
			);
			expect(body.success).toBe(true);
			expect(body.result[0].selector).toBe("h1");
			expect(body.result[0].results[0].text).toBe("Hello");
		}
	);

	it(
		"returns placeholder json shaped like the response format",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const body = JSON.parse(
				await fetchText(`http://${ip}:${port}/?action=json&html=${html}`)
			);
			expect(body).toMatchObject({ success: true, result: { heading: "" } });
		}
	);

	it("takes a screenshot", BROWSER_RENDERING_RETRY, async ({ expect }) => {
		const response = await fetchOk(
			`http://${ip}:${port}/?action=screenshot&html=${html}`
		);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("x-browser-ms-used")).toMatch(/^\d+$/);
		const png = new Uint8Array(await response.arrayBuffer());
		expect(new TextDecoder().decode(png.subarray(1, 4))).toBe("PNG");
	});
});
