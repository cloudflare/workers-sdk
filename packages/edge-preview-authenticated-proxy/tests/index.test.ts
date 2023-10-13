import { randomBytes } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

function removeUUID(str: string) {
	return str.replace(
		/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g,
		"00000000-0000-0000-0000-000000000000"
	);
}

describe("Preview Worker", () => {
	let worker: UnstableDevWorker;
	let remote: UnstableDevWorker;
	let tmpDir: string;

	beforeAll(async () => {
		worker = await unstable_dev(path.join(__dirname, "../src/index.ts"), {
			config: path.join(__dirname, "../wrangler.toml"),
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

	it("should obtain token from exchange_url", async () => {
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
	it("should allow tokens > 4096 bytes", async () => {
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
			'"token=00000000-0000-0000-0000-000000000000; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None"'
		);
		tokenId = (resp.headers.get("set-cookie") ?? "")
			.split(";")[0]
			.split("=")[1];
		resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None`,
				},
			}
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ignoring this test type error for sake of turborepo PR
		const json = (await resp.json()) as any;

		expect(
			json.headers.find(([h]: [string]) => h === "cf-workers-preview-token")[1]
		).toBe(token);
		expect(json.url).toMatchInlineSnapshot('"http://127.0.0.1:6756/"');
	});
	it("should be redirected with cookie", async () => {
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
			'"token=00000000-0000-0000-0000-000000000000; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None"'
		);
		tokenId = (resp.headers.get("set-cookie") ?? "")
			.split(";")[0]
			.split("=")[1];
	});

	it("should convert cookie to header", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None`,
				},
			}
		);

		const json = (await resp.json()) as { headers: string[][]; url: string };
		expect(Object.fromEntries([...json.headers])).toMatchObject({
			"cf-workers-preview-token": "TEST_TOKEN",
		});
		expect(json.url).toMatchInlineSnapshot('"http://127.0.0.1:6756/"');
	});
	it("should not follow redirects", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/redirect`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None`,
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
	it("should return method", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/method`,
			{
				method: "PUT",
				headers: {
					cookie: `token=${tokenId}; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"PUT"');
	});
	it("should return header", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/header`,
			{
				method: "PUT",
				headers: {
					"X-Custom-Header": "custom",
					cookie: `token=${tokenId}; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"custom"');
	});
	it("should return status", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/status`,
			{
				method: "PUT",
				headers: {
					cookie: `token=${tokenId}; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"407"');
	});
});

describe("Raw HTTP preview", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev(path.join(__dirname, "../src/index.ts"), {
			// @ts-expect-error TODO: figure out the right way to get the server to accept host from the request
			host: "0000.rawhttp.devprod.cloudflare.dev",
			experimental: {
				disableExperimentalWarning: true,
			},
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("should allow arbitrary headers in cross-origin requests", async () => {
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
});
