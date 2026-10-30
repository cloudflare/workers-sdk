import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
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

	it("renders static pages", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("Hello, world!");
	});

	it.for([
		"/..%2fpackage.json",
		"/other-path%2f..%2f..%2fpackage.json",
		"/..%2fpublic-neighbor/message.txt",
		"/%2e%2e%2fpublic-neighbor%2fmessage.txt",
		"/nested%2f..%2f..%2fpublic-neighbor/message.txt",
		"/%2e%2e%2fpublic.txt",
		"/%2e%2e%5cpublic-neighbor%5cmessage.txt",
		"/%2e%2e%5cpublic.txt",
	])(
		"keeps %s inside the build output directory",
		async (pathname, { expect }) => {
			const response = await fetch(`http://${ip}:${port}${pathname}`);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain("Hello, world!");
		}
	);

	it("serves an asset whose filename starts with two dots", async ({
		expect,
	}) => {
		const response = await fetch(`http://${ip}:${port}/..notes.txt`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(
			"An asset inside the output directory.\n"
		);
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
