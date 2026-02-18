import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";

function removeUUID(str: string) {
	return str.replace(
		/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g,
		"00000000-0000-0000-0000-000000000000"
	);
}

describe("Preview Worker", () => {
	let worker: Unstable_DevWorker;
	let remote: Unstable_DevWorker;
	let tmpDir: string;

	beforeAll(async () => {
		worker = await unstable_dev(path.join(__dirname, "../src/index.ts"), {
			config: path.join(__dirname, "../wrangler.jsonc"),
			ip: "127.0.0.1",
			experimental: {
				disableExperimentalWarning: true,
			},
			logLevel: "none",
		});

		tmpDir = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "preview-tests"))
		);

		await fs.writeFile(
			path.join(tmpDir, "remote.js"),
			/*javascript*/ `
				export default {
					fetch(request) {
						const url = new URL(request.url)
						if(url.pathname === "/exchange") {
							return Response.json({
								token: "TEST_TOKEN",
								prewarm: "TEST_PREWARM"
							})
						}
						if(url.pathname === "/redirect") {
							return Response.redirect("https://example.com", 302)
						}
						if(url.pathname === "/method") {
							return new Response(request.method)
						}
						if(url.pathname === "/status") {
							return new Response(407)
						}
						if(url.pathname === "/header") {
							return new Response(request.headers.get("X-Custom-Header"))
						}
						return Response.json({
							url: request.url,
							headers: [...request.headers.entries()]
						})
					}
				}
			`.trim()
		);

		await fs.writeFile(
			path.join(tmpDir, "wrangler.toml"),
			/*toml*/ `
name = "remote-worker"
compatibility_date = "2023-01-01"
			`.trim()
		);

		remote = await unstable_dev(path.join(tmpDir, "remote.js"), {
			config: path.join(tmpDir, "wrangler.toml"),
			ip: "127.0.0.1",
			experimental: { disableExperimentalWarning: true },
		});
	});

	afterAll(async () => {
		await worker.stop();
		await remote.stop();

		try {
			await fs.rm(tmpDir, { recursive: true });
		} catch {}
	});

	let tokenId: string | null = null;

	it("should obtain token from exchange_url", async ({ expect }) => {
		const resp = await worker.fetch(
			`https://preview.devprod.cloudflare.dev/exchange?exchange_url=${encodeURIComponent(
				`http://127.0.0.1:${remote.port}/exchange`
			)}`,
			{
				method: "POST",
			}
		);
		const text = await resp.json();
		expect(text).toMatchInlineSnapshot(
			`
			{
			  "prewarm": "TEST_PREWARM",
			  "token": "TEST_TOKEN",
			}
		`
		);
	});
	it("should reject invalid exchange_url", async ({ expect }) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const resp = await worker.fetch(
			`https://preview.devprod.cloudflare.dev/exchange?exchange_url=not_an_exchange_url`,
			{ method: "POST" }
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"Error","message":"Invalid URL"}"`
		);
	});
	it("should allow tokens > 4096 bytes", async ({ expect }) => {
		// 4096 is the size limit for cookies
		const token = randomBytes(4096).toString("hex");
		expect(token.length).toBe(8192);

		let resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=${encodeURIComponent(
				token
			)}&prewarm=${encodeURIComponent(
				`http://127.0.0.1:${remote.port}/prewarm`
			)}&remote=${encodeURIComponent(
				`http://127.0.0.1:${remote.port}`
			)}&suffix=${encodeURIComponent("/hello?world")}`,
			{
				method: "GET",
				redirect: "manual",
			}
		);
		expect(await resp.text()).toMatchInlineSnapshot('""');
		expect(resp.headers.get("location")).toMatchInlineSnapshot(
			'"/hello?world"'
		);
		expect(
			removeUUID(resp.headers.get("set-cookie") ?? "")
		).toMatchInlineSnapshot(
			'"token=00000000-0000-0000-0000-000000000000; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None"'
		);
		tokenId = (resp.headers.get("set-cookie") ?? "")
			.split(";")[0]
			.split("=")[1];
		resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}`,
				},
			}
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ignoring this test type error for sake of turborepo PR
		const json = (await resp.json()) as any;

		expect(json).toMatchObject({
			url: `http://127.0.0.1:${remote.port}/`,
			headers: expect.arrayContaining([["cf-workers-preview-token", token]]),
		});
	});
	it("should be redirected with cookie", async ({ expect }) => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=TEST_TOKEN&prewarm=${encodeURIComponent(
				`http://127.0.0.1:${remote.port}/prewarm`
			)}&remote=${encodeURIComponent(
				`http://127.0.0.1:${remote.port}`
			)}&suffix=${encodeURIComponent("/hello?world")}`,
			{
				method: "GET",
				redirect: "manual",
			}
		);
		expect(resp.headers.get("location")).toMatchInlineSnapshot(
			'"/hello?world"'
		);
		expect(
			removeUUID(resp.headers.get("set-cookie") ?? "")
		).toMatchInlineSnapshot(
			'"token=00000000-0000-0000-0000-000000000000; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None"'
		);
		tokenId = (resp.headers.get("set-cookie") ?? "")
			.split(";")[0]
			.split("=")[1];
	});
	it("should reject invalid prewarm url", async ({ expect }) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=TEST_TOKEN&prewarm=not_a_prewarm_url&remote=${encodeURIComponent(
				`http://127.0.0.1:${remote.port}`
			)}&suffix=${encodeURIComponent("/hello?world")}`
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"Error","message":"Invalid URL"}"`
		);
	});
	it("should reject invalid remote url", async ({ expect }) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=TEST_TOKEN&prewarm=${encodeURIComponent(
				`http://127.0.0.1:${remote.port}/prewarm`
			)}&remote=not_a_remote_url&suffix=${encodeURIComponent("/hello?world")}`
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"Error","message":"Invalid URL"}"`
		);
	});

	it("should convert cookie to header", async ({ expect }) => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
			}
		);

		const json = (await resp.json()) as { headers: string[][]; url: string };
		expect(json).toMatchObject({
			url: `http://127.0.0.1:${remote.port}/`,
			headers: expect.arrayContaining([
				["cf-workers-preview-token", "TEST_TOKEN"],
			]),
		});
	});
	it("should not follow redirects", async ({ expect }) => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/redirect`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(resp.status).toMatchInlineSnapshot("302");
		expect(resp.headers.get("Location")).toMatchInlineSnapshot(
			'"https://example.com"'
		);
		expect(await resp.text()).toMatchInlineSnapshot('""');
	});
	it("should return method", async ({ expect }) => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/method`,
			{
				method: "PUT",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"PUT"');
	});
	it("should return header", async ({ expect }) => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/header`,
			{
				method: "PUT",
				headers: {
					"X-Custom-Header": "custom",
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"custom"');
	});
	it("should return status", async ({ expect }) => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/status`,
			{
				method: "PUT",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"407"');
	});
});

describe("Raw HTTP preview", () => {
	let worker: Unstable_DevWorker;
	let remote: Unstable_DevWorker;
	let tmpDir: string;

	beforeAll(async () => {
		worker = await unstable_dev(path.join(__dirname, "../src/index.ts"), {
			// @ts-expect-error TODO: figure out the right way to get the server to accept host from the request
			host: "0000.rawhttp.devprod.cloudflare.dev",
			ip: "127.0.0.1",
			experimental: {
				disableExperimentalWarning: true,
			},
		});

		tmpDir = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "preview-tests"))
		);

		await fs.writeFile(
			path.join(tmpDir, "remote.js"),
			/*javascript*/ `
				export default {
					fetch(request) {
						const url = new URL(request.url)
						if(url.pathname === "/exchange") {
							return Response.json({
								token: "TEST_TOKEN",
								prewarm: "TEST_PREWARM"
							})
						}
						if(url.pathname === "/redirect") {
							return Response.redirect("https://example.com", 302)
						}
						if(url.pathname === "/method") {
							return new Response(request.method, {
								headers: { "Test-Http-Method": request.method },
							})
						}
						if(url.pathname === "/status") {
							return new Response(407)
						}
						if(url.pathname === "/header") {
							return new Response(request.headers.get("X-Custom-Header"))
						}
						if(url.pathname === "/cookies") {
							const headers = new Headers();

							headers.append("Set-Cookie", "foo=1");
							headers.append("Set-Cookie", "bar=2");

							return new Response(undefined, {
								headers,
							});
						}
						return Response.json({
							url: request.url,
							headers: [...request.headers.entries()]
						}, { headers: { "Content-Encoding": "identity" } })
					}
				}
			`.trim()
		);

		await fs.writeFile(
			path.join(tmpDir, "wrangler.toml"),
			/*toml*/ `
name = "remote-worker"
compatibility_date = "2023-01-01"
			`.trim()
		);

		remote = await unstable_dev(path.join(tmpDir, "remote.js"), {
			config: path.join(tmpDir, "wrangler.toml"),
			ip: "127.0.0.1",
			experimental: { disableExperimentalWarning: true },
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("should allow arbitrary headers in cross-origin requests", async ({
		expect,
	}) => {
		const resp = await worker.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev`,
			{
				method: "OPTIONS",
				headers: {
					"Access-Control-Request-Headers": "foo",
					origin: "https://cloudflare.dev",
				},
			}
		);

		expect(resp.headers.get("Access-Control-Allow-Headers")).toBe("foo");
	});

	it("should allow arbitrary methods in cross-origin requests", async ({
		expect,
	}) => {
		const resp = await worker.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev`,
			{
				method: "OPTIONS",
				headers: {
					"Access-Control-Request-Method": "PUT",
					origin: "https://cloudflare.dev",
				},
			}
		);

		expect(resp.headers.get("Access-Control-Allow-Methods")).toBe("*");
	});

	it("should preserve multiple cookies", async ({ expect }) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await worker.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/cookies`,
			{
				method: "GET",
				headers: {
					"Access-Control-Request-Method": "GET",
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": `http://127.0.0.1:${remote.port}`,
				},
			}
		);

		expect(resp.headers.get("cf-ew-raw-set-cookie")).toMatchInlineSnapshot(
			`"foo=1, bar=2"`
		);
	});

	it("should pass headers to the user-worker", async ({ expect }) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await worker.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/`,
			{
				method: "GET",
				headers: {
					"Access-Control-Request-Method": "GET",
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": `http://127.0.0.1:${remote.port}`,
					"Some-Custom-Header": "custom",
					Accept: "application/json",
				},
			}
		);

		const body = (await resp.json()) as Record<string, unknown>;

		const headers = (body.headers as [string, string][]).filter(
			(h) => h[0] === "some-custom-header" || h[0] === "accept"
		);

		// This contains some-custom-header & accept, as expected
		expect(headers).toMatchInlineSnapshot(`
			[
			  [
			    "accept",
			    "application/json",
			  ],
			  [
			    "some-custom-header",
			    "custom",
			  ],
			]
		`);
	});

	it("should use the method specified on the X-CF-Http-Method header", async ({
		expect,
	}) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await worker.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/method`,
			{
				method: "POST",
				headers: {
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": `http://127.0.0.1:${remote.port}`,
					"X-CF-Http-Method": "PUT",
				},
			}
		);

		expect(await resp.text()).toEqual("PUT");
	});

	it.for(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
		"should support %s method specified on the X-CF-Http-Method header",
		async (method, { expect }) => {
			const token = randomBytes(4096).toString("hex");
			const resp = await worker.fetch(
				`https://0000.rawhttp.devprod.cloudflare.dev/method`,
				{
					method: "POST",
					headers: {
						origin: "https://cloudflare.dev",
						"X-CF-Token": token,
						"X-CF-Remote": `http://127.0.0.1:${remote.port}`,
						"X-CF-Http-Method": method,
					},
				}
			);

			// HEAD request does not return any body. So we will confirm by asserting the response header
			expect(await resp.text()).toEqual(method === "HEAD" ? "" : method);
			// Header from the client response will be prefixed with "cf-ew-raw-"
			expect(resp.headers.get("cf-ew-raw-Test-Http-Method")).toEqual(method);
		}
	);

	it("should fallback to the request method if the X-CF-Http-Method header is missing", async ({
		expect,
	}) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await worker.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/method`,
			{
				method: "PUT",
				headers: {
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": `http://127.0.0.1:${remote.port}`,
				},
			}
		);

		expect(await resp.text()).toEqual("PUT");
	});

	it("should strip cf-ew-raw- prefix from headers which have it before hitting the user-worker", async ({
		expect,
	}) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await worker.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/`,
			{
				method: "GET",
				headers: {
					"Access-Control-Request-Method": "GET",
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": `http://127.0.0.1:${remote.port}`,
					"cf-ew-raw-Some-Custom-Header": "custom",
					"cf-ew-raw-Accept": "application/json",
				},
			}
		);

		const body = (await resp.json()) as Record<string, unknown>;

		const headers = (body.headers as [string, string][]).filter(
			(h) =>
				h[0] === "some-custom-header" ||
				h[0] === "accept" ||
				h[0].startsWith("cf-ew-raw-")
		);

		// This contains some-custom-header & accept, as expected, and does not contain cf-ew-raw-some-custom-header or cf-ew-raw-accept
		expect(headers).toMatchInlineSnapshot(`
			[
			  [
			    "accept",
			    "application/json",
			  ],
			  [
			    "some-custom-header",
			    "custom",
			  ],
			]
		`);
	});
});
