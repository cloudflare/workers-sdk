import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { request } from "undici";
import { describe, test, vi } from "vitest";
import { startWorker } from "../../../api/startDevWorker";
import { mockConsoleMethods } from "../../helpers/mock-console";

vi.unmock("child_process");
vi.unmock("undici");

describe("forwarded protocol response headers", () => {
	runInTempDir();
	mockConsoleMethods();

	test.for([
		{ header: undefined, scheme: "http" },
		{ header: "https", scheme: "https" },
		{ header: "invalid", scheme: "http" },
	])(
		"maps response URLs to the public origin with $header",
		async ({ header, scheme }, { expect }) => {
			await seed({
				"index.js": `export default {
				fetch(request) {
					const publicOrigin = "https://" + new URL(request.url).host;
					return Response.json({ url: request.url, origin: request.headers.get("Origin") }, {
						status: 401,
						headers: {
							Location: publicOrigin + "/next",
							"WWW-Authenticate": 'Bearer resource_metadata="' + publicOrigin + '/.well-known/oauth-protected-resource"',
							"Access-Control-Allow-Origin": new URL(request.url).origin,
							"X-External-URL": "https://unrelated.example.com/path",
						},
					});
				}
			}`,
			});
			const worker = await startWorker({
				entrypoint: "index.js",
				compatibilityDate: "2025-01-01",
				dev: {
					server: { hostname: "127.0.0.1", port: 0 },
					origin: { hostname: "worker.example.com", secure: false },
					inspector: false,
					persist: false,
				},
			});
			try {
				const response = await request(
					new URL("/path?query=1", await worker.url),
					{
						headers: {
							Host: "app.example.com",
							Origin: `${scheme}://app.example.com`,
							...(header === undefined ? {} : { "X-Forwarded-Proto": header }),
						},
					}
				);
				expect(response.statusCode).toBe(401);
				expect(response.headers.location).toBe(
					`${scheme}://app.example.com/next`
				);
				expect(response.headers["www-authenticate"]).toBe(
					`Bearer resource_metadata="${scheme}://app.example.com/.well-known/oauth-protected-resource"`
				);
				expect(response.headers["access-control-allow-origin"]).toBe(
					`${scheme}://app.example.com`
				);
				expect(response.headers["x-external-url"]).toBe(
					"https://unrelated.example.com/path"
				);
				expect(await response.body.json()).toEqual({
					url: "http://worker.example.com/path?query=1",
					origin: "http://worker.example.com",
				});
			} finally {
				await worker.dispose();
			}
		}
	);
});
