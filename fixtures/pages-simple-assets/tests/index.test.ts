import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Functions", async () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("renders static pages", async () => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("Hello, world!");
	});

	it("doesn't escape out of the build output directory", async () => {
		let response = await fetch(`http://${ip}:${port}/..%2fpackage.json`);
		let text = await response.text();
		expect(text).toContain("Hello, world!");

		response = await fetch(
			`http://${ip}:${port}/other-path%2f..%2f..%2fpackage.json`
		);
		text = await response.text();
		expect(text).toContain("Hello, world!");
	});

	it("doesn't redirect to protocol-less URLs", async () => {
		{
			const response = await fetch(
				`http://${ip}:${port}/%2Fwww.example.com/index/`,
				{ redirect: "manual" }
			);
			expect(response.status).toEqual(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/");
		}
		{
			const response = await fetch(
				`http://${ip}:${port}/%5Cwww.example.com/index/`,
				{ redirect: "manual" }
			);
			expect(response.status).toEqual(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/");
		}
		{
			const response = await fetch(
				`http://${ip}:${port}/%09/www.example.com/index/`,
				{ redirect: "manual" }
			);
			expect(response.status).toEqual(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/");
		}
	});
});
