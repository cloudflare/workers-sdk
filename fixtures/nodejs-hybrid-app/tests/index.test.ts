import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it, test } from "vitest";
import { createMockPostgresServer } from "../../shared/src/mock-postgres-server";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("nodejs compat", () => {
	let wrangler: Awaited<ReturnType<typeof runWranglerDev>>;
	let mockPg: Awaited<ReturnType<typeof createMockPostgresServer>>;

	beforeAll(async () => {
		// Start a local mock Postgres server that returns canned results
		mockPg = await createMockPostgresServer({
			rows: [{ id: "1", name: "test-row" }],
		});

		wrangler = await runWranglerDev(resolve(__dirname, "../src"), [
			"--port=0",
			"--inspector-port=0",
			`--var`,
			`DB_PORT:${mockPg.port}`,
		]);
	});

	afterAll(async () => {
		await wrangler.stop();
		await mockPg.stop();
	});

	it("should work when running code requiring polyfills", async ({
		expect,
	}) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-process`);
		const body = await response.text();
		expect(body).toMatchInlineSnapshot(`"OK!"`);
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

	test("set/clearImmediate", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-immediate`);
		await expect(response.text()).resolves.toBe("OK");
	});

	test("node:tls", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-tls`);
		await expect(response.text()).resolves.toBe("OK");
	});

	test("node:crypto", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-crypto`);
		await expect(response.text()).resolves.toBe("OK");
	});

	test("node:sqlite", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-sqlite`);
		await expect(response.text()).resolves.toBe("OK");
	});

	test("node:http", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-http`);
		await expect(response.text()).resolves.toBe("OK");
	});

	test("debug import", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-debug-import`);
		await expect(response.json()).resolves.toEqual([
			"test Test import message 1",
			"example:foo Example foo import message",
			"test Test import enabled message",
		]);
	});

	test("debug require", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/test-debug-require`);
		await expect(response.json()).resolves.toEqual([
			"test Test require message 1",
			"example:foo Example foo require message",
			"test Test require enabled message",
		]);
	});

	test("process.env contains vars", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/process-env`);
		await expect(response.json()).resolves.toMatchObject({
			DB_HOSTNAME: "127.0.0.1",
			DEV_VAR_FROM_DOT_ENV: "dev-var-from-dot-env",
		});
	});

	test("env contains vars", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/env`);
		await expect(response.json()).resolves.toMatchObject({
			DB_HOSTNAME: "127.0.0.1",
			DEV_VAR_FROM_DOT_ENV: "dev-var-from-dot-env",
		});
	});

	test("Postgres", async ({ expect }) => {
		const { ip, port } = wrangler;
		const response = await fetch(`http://${ip}:${port}/query`);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ id: "1" });
	});
});
