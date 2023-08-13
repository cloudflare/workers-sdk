import { resolve } from "node:path";
import { fetch } from "undici";
<<<<<<< HEAD
import { describe, it, beforeAll, afterAll } from "vitest";
import { runTrianglePagesDev } from "../../shared/src/run-triangle-long-lived";
=======
import { describe, it, afterAll, beforeAll } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f

describe("Pages Functions", async () => {
	let ip: string, port: number, stop: () => Promise<unknown>;

	beforeAll(async () => {
		({ ip, port, stop } = await runTrianglePagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0"]
		));
	});

	afterAll(async () => {
		await stop();
	});

	it("renders static pages", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("Hello, world!");
	});

	it("doesn't escape out of the build output directory", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/..%2fpackage.json`);
		let text = await response.text();
		expect(text).toContain("Hello, world!");

		response = await fetch(
			`http://${ip}:${port}/other-path%2f..%2f..%2fpackage.json`
		);
		text = await response.text();
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
