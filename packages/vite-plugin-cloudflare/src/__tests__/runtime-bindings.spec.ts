import assert from "node:assert";
import * as fs from "node:fs/promises";
import { cloudflare } from "@cloudflare/vite-plugin";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { createServer } from "vite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

const EMAIL_BODY = "Subject: Café\r\n\r\nHello!";

describe("local runtime bindings through Vite", () => {
	runInTempDir();
	afterEach(() => vi.unstubAllEnvs());
	beforeEach(async () => {
		if (process.platform === "win32") {
			const root = await fs.realpath(process.cwd());
			process.chdir(root);
			vi.stubEnv("PWD", root);
		}
		await seed({
			"wrangler.json": JSON.stringify({
				name: "runtime-bindings",
				main: "./index.js",
				compatibility_date: "2026-04-01",
				stream: { binding: "STREAM" },
				r2_buckets: [{ binding: "BUCKET", bucket_name: "runtime-bucket" }],
				kv_namespaces: [{ binding: "KV", id: "runtime-kv" }],
				realtimekit: [
					{
						binding: "RTK",
						app_id: "2da1c5c6-8e8f-4119-b89e-18558e051486",
						remote: true,
					},
				],
			}),
			"index.js": `
				import { EmailMessage } from "cloudflare:email";
				export default {
					async fetch(request, env) {
						switch (new URL(request.url).pathname) {
							case "/realtimekit": {
								try {
									await env.RTK.createMeeting({ title: "Standup" });
									return new Response("Unexpected local RealtimeKit simulator");
								} catch (error) {
									return Response.json(error.message);
								}
							}
							case "/email-string":
							case "/email-stream": {
								const body = ${JSON.stringify(EMAIL_BODY)};
								const input = new URL(request.url).pathname === "/email-string"
									? body : new Blob([body]).stream();
								const message = new EmailMessage("sender@example.com", "recipient@example.com", input);
								if (!(message.raw instanceof ReadableStream)) {
									throw new Error("Expected EmailMessage.raw to be a ReadableStream");
								}
								return Response.json(await new Response(message.raw).text());
							}
							case "/stream": {
								const video = await env.STREAM.upload(new Response(new Uint8Array([0, 1, 2, 3])).body);
								const captions = env.STREAM.video(video.id).captions;
								await captions.upload("en", new Response("test").body);
								await captions.generate("fr");
								const uploaded = await new Response(await captions.get("en")).text();
								const generated = await new Response(await captions.get("fr")).text();
								let missing;
								try { await captions.get("de"); } catch (error) { missing = error.message; }
								return Response.json({ customerCode: video.customerCode, uploaded, generated, missing });
							}
							case "/r2": {
								for (const key of ["Ａ", "📷", "📸"]) await env.BUCKET.put(key, "value");
								const first = await env.BUCKET.list({ startAfter: "Ａ", limit: 1 });
								const second = await env.BUCKET.list({ startAfter: "Ａ", limit: 1, cursor: first.cursor });
								return Response.json([first, second].map(page => page.objects.map(object => object.key)));
							}
							case "/kv": {
								await env.KV.put("null", "null", { metadata: { testing: "null" } });
								const values = await env.KV.getWithMetadata(["null", "missing"], "json");
								return Response.json(Object.fromEntries(values));
							}
						}
						return new Response("not found", { status: 404 });
					}
				};
			`,
		});
	});

	test.for([
		{ path: "/realtimekit", result: "Binding RTK needs to be run remotely" },
		{ path: "/email-string", result: EMAIL_BODY },
		{ path: "/email-stream", result: EMAIL_BODY },
		{
			path: "/stream",
			result: {
				customerCode: "placeholder",
				uploaded: "test",
				generated: "WEBVTT\n",
				missing: "Caption not found",
			},
		},
		{ path: "/r2", result: [["📷"], ["📸"]] },
		{
			path: "/kv",
			result: {
				null: { value: null, metadata: { testing: "null" } },
				missing: null,
			},
		},
	] as const)(
		"serves $path with the released runtime behavior",
		async ({ path, result }, { expect, onTestFinished }) => {
			const server = await createServer({
				root: process.cwd(),
				configFile: false,
				logLevel: "silent",
				server: { watch: null },
				plugins: [
					cloudflare({
						inspectorPort: false,
						persistState: false,
						remoteBindings: false,
					}),
				],
			});
			onTestFinished(() => server.close());
			await server.listen(0);
			const url = server.resolvedUrls?.local[0];
			assert(url);
			const response = await fetch(new URL(path, url));
			expect(response.status, await response.clone().text()).toBe(200);
			expect(await response.json()).toEqual(
				path === "/realtimekit"
					? expect.stringContaining("Binding RTK needs to be run remotely")
					: path === "/stream"
						? {
								...result,
								missing: expect.stringContaining("Caption not found"),
							}
						: result
			);
		}
	);
});
