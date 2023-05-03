import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe.concurrent("Pages Functions", () => {
	let ip, port, stop;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			[]
		));
	});

	afterAll(async () => await stop());

	it("renders static pages", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("Hello, world!");
	});

	it("doesn't redirect to protocol-less URLs", async ({ expect }) => {
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
