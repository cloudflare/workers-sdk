import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("Preview Worker", () => {
	let worker: UnstableDevWorker;
	let remote: UnstableDevWorker;
	let tmpDir: string;

	beforeAll(async () => {
		worker = await unstable_dev("src/index.ts", {
			experimental: {
				disableExperimentalWarning: true,
				// experimentalLocal: true,
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

		remote = await unstable_dev(path.join(tmpDir, "remote.js"), {
			experimental: { disableExperimentalWarning: true },
			port: 6756,
		});
	});

	afterAll(async () => {
		await worker.stop();
		await remote.stop();

		try {
			await fs.rm(tmpDir, { recursive: true });
		} catch {}
	});

	it("should obtain token from exchange_url", async () => {
		const resp = await worker.fetch(
			`https://preview.devprod.cloudflare.dev/exchange?exchange_url=${encodeURIComponent(
				"http://127.0.0.1:6756/exchange"
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
	it("should be redirected with cookie", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=TEST_TOKEN&prewarm=${encodeURIComponent(
				"http://127.0.0.1:6756/prewarm"
			)}&remote=${encodeURIComponent(
				"http://127.0.0.1:6756"
			)}&suffix=${encodeURIComponent("/hello?world")}`,
			{
				method: "GET",
				redirect: "manual",
			}
		);
		expect(Object.fromEntries([...resp.headers.entries()])).toMatchObject({
			"content-length": "0",
			location: "/hello?world",
			"set-cookie":
				"token=%7B%22token%22%3A%22TEST_TOKEN%22%2C%22remote%22%3A%22http%3A%2F%2F127.0.0.1%3A6756%22%7D; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None",
		});
	});
	it("should convert cookie to header", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev`,
			{
				method: "GET",
				headers: {
					cookie:
						"token=%7B%22token%22%3A%22TEST_TOKEN%22%2C%22remote%22%3A%22http%3A%2F%2F127.0.0.1%3A6756%22%7D; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None",
				},
			}
		);

		const json = (await resp.json()) as { headers: string[][]; url: string };
		expect(Object.fromEntries([...json.headers])).toMatchObject({
			"cf-workers-preview-token": "TEST_TOKEN",
		});
		expect(json.url).toMatchInlineSnapshot(
			'"http://preview.devprod.cloudflare.dev/"'
		);
	});
	it("should not follow redirects", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/redirect`,
			{
				method: "GET",
				headers: {
					cookie:
						"token=%7B%22token%22%3A%22TEST_TOKEN%22%2C%22remote%22%3A%22http%3A%2F%2F127.0.0.1%3A6756%22%7D; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None",
				},
				redirect: "manual",
			}
		);

		expect(resp.status).toMatchInlineSnapshot("302");
		expect(resp.headers.get("Location")).toMatchInlineSnapshot(
			'"https://example.com/"'
		);
		expect(await resp.text()).toMatchInlineSnapshot('""');
	});
	it("should return method", async () => {
		const resp = await worker.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/method`,
			{
				method: "PUT",
				headers: {
					cookie:
						"token=%7B%22token%22%3A%22TEST_TOKEN%22%2C%22remote%22%3A%22http%3A%2F%2F127.0.0.1%3A6756%22%7D; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None",
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
					cookie:
						"token=%7B%22token%22%3A%22TEST_TOKEN%22%2C%22remote%22%3A%22http%3A%2F%2F127.0.0.1%3A6756%22%7D; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None",
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
					cookie:
						"token=%7B%22token%22%3A%22TEST_TOKEN%22%2C%22remote%22%3A%22http%3A%2F%2F127.0.0.1%3A6756%22%7D; Domain=preview.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None",
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"407"');
	});
});
