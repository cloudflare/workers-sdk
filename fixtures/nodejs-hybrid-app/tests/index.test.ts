import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it, test } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("nodejs compat", () => {
	let wrangler: Awaited<ReturnType<typeof runWranglerDev>>;

	beforeAll(async () => {
		wrangler = await runWranglerDev(resolve(__dirname, "../src"), [
			"--port=0",
			"--inspector-port=0",
		]);
	});

	afterAll(async () => {
		await wrangler.stop();
	});
	it("should work when running code requiring polyfills", async ({
		expect,
	}) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-process`);
		const body = await response.text();
		expect(body).toMatchInlineSnapshot(`"OK!"`);

		// Disabling actually querying the database since we are getting this error:
		// > too many connections for role 'reader'
		// const response = await fetch(`http://${ip}:${port}/query`);
		// const body = await response.text();
		// console.log(body);
		// const result = JSON.parse(body) as { id: string };
		// expect(result.id).toEqual("1");
	});

	it("should be able to call `getRandomValues()` bound to any object", async ({
		expect,
	}) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-random`);
		const body = await response.json();
		expect(body).toEqual([
			expect.any(String),
			expect.any(String),
			expect.any(String),
			expect.any(String),
		]);
	});

	test("crypto.X509Certificate is implemented", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-x509-certificate`);
		await expect(response.text()).resolves.toBe(`"OK!"`);
	});

	test("import unenv aliased packages", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-require-alias`);
		await expect(response.text()).resolves.toBe(`"OK!"`);
	});
});
