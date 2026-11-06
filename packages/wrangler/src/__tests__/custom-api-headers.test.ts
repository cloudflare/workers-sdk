import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { fetchListResult, fetchResult } from "../cfetch";
import {
	createCloudflareClient,
	fetchKVGetValue,
	fetchR2Objects,
} from "../cfetch/internal";
import { logger } from "../logger";
import { mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";

describe("custom API headers", () => {
	mockApiToken();
	const std = mockConsoleMethods();
	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_API_HEADERS", '{"X-Custom-Header":"value"}');
		vi.stubEnv("WRANGLER_LOG_SANITIZE", undefined);
	});

	it.for([undefined, "true", "false"])(
		"always applies the API and SDK header allowlist with sanitization=%s",
		async (sanitize, { expect }) => {
			vi.stubEnv("WRANGLER_LOG", "debug");
			vi.stubEnv("WRANGLER_LOG_SANITIZE", sanitize);
			vi.stubEnv(
				"CLOUDFLARE_API_HEADERS",
				'{"X-Custom-Header":"configured-secret","User-Agent":"custom-agent","X-Auth-Key":"request-auth-key","X-Auth-Email":"user@example.com","X-Session":"session-secret"}'
			);
			const diagnostics = vi.spyOn(logger, "debugWithSanitization");
			let requests = 0;
			msw.use(
				http.get("*/accounts", ({ request }) => {
					requests++;
					expect(request.headers.get("x-custom-header")).toBe(
						"configured-secret"
					);
					expect(request.headers.get("user-agent")).toBe("custom-agent");
					expect(request.headers.get("x-auth-key")).toBe("request-auth-key");
					return HttpResponse.json(
						{
							success: true,
							result: [],
							result_info: { page: 1, total_pages: 1 },
						},
						{
							headers: {
								"X-AUTH-KEY": "response-auth-key",
								Authorization: "response-token",
								"Set-Cookie": "session=response-secret",
							},
						}
					);
				})
			);
			await fetchResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, "/accounts", {
				headers: { "X-CUSTOM-HEADER": "request-secret" },
			});
			await createCloudflareClient(
				COMPLIANCE_REGION_CONFIG_UNKNOWN
			).accounts.list();
			expect(requests).toBe(2);
			const headerDiagnostics = diagnostics.mock.calls.filter(
				([label]) => label === "HEADERS:"
			);
			expect(headerDiagnostics).toHaveLength(4);
			for (const [, headers] of headerDiagnostics) {
				expect(headers).toContain('"x-auth-key": "[REDACTED]"');
				expect(headers).toContain('"authorization": "[REDACTED]"');
				expect(headers).not.toContain("response-secret");
			}
			expect(std.debug).not.toContain("configured-secret");
			expect(std.debug).not.toContain("request-secret");
			expect(std.debug).not.toContain("request-auth-key");
			expect(std.debug).not.toContain("session-secret");
			expect(std.debug).not.toContain("user@example.com");
			if (sanitize === "false") {
				expect(std.debug).toContain('"x-custom-header": "[REDACTED]"');
				expect(std.debug).toContain('"user-agent": "custom-agent"');
			} else {
				expect(std.debug).toContain("omitted; set WRANGLER_LOG_SANITIZE=false");
				expect(std.debug).not.toContain("request-secret");
				expect(std.debug).not.toContain("configured-secret");
			}
		}
	);

	it("overrides upload headers and redacts custom values from diagnostics", async ({
		expect,
	}) => {
		vi.stubEnv(
			"CLOUDFLARE_API_HEADERS",
			'{"X-Custom-Header":"configured-secret"}'
		);
		const debug = vi.spyOn(logger, "debugWithSanitization");
		msw.use(
			http.post("*/accounts/id/workers/scripts/test", async ({ request }) => {
				expect(request.headers.get("x-custom-header")).toBe(
					"configured-secret"
				);
				expect(request.headers.get("authorization")).toBe(
					"Bearer some-api-token"
				);
				expect(request.headers.get("content-type")).toMatch(
					/^multipart\/form-data; boundary=/
				);
				expect(await request.text()).toContain('name="metadata"\r\n\r\n{}');
				return HttpResponse.json({ success: true, result: { id: "test" } });
			})
		);
		const body = new (await import("undici")).FormData();
		body.set("metadata", "{}");
		await fetchResult(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			"/accounts/id/workers/scripts/test",
			{
				method: "POST",
				body,
				headers: { "X-CUSTOM-HEADER": "override-secret" },
			}
		);
		expect(JSON.stringify(debug.mock.calls)).not.toContain("override-secret");
		expect(JSON.stringify(debug.mock.calls)).not.toContain("configured-secret");
		expect(JSON.stringify(debug.mock.calls)).toContain("[REDACTED]");
	});

	it("overrides authentication on API, SDK, and raw requests", async ({
		expect,
	}) => {
		const custom = {
			Authorization: "Custom configured-token",
			"X-Auth-Key": "configured-key",
			"X-Auth-Email": "user@example.com",
			"Proxy-Authorization": "Basic configured-proxy-token",
		};
		vi.stubEnv("CLOUDFLARE_API_HEADERS", JSON.stringify(custom));
		let requests = 0;
		msw.use(
			http.get(/\/client\/v4\/accounts(?:\/|$)/, ({ request }) => {
				requests++;
				for (const [name, value] of Object.entries(custom)) {
					expect(request.headers.get(name)).toBe(value);
				}
				return HttpResponse.json({
					success: true,
					result: [],
					result_info: { page: 1, total_pages: 1 },
				});
			})
		);
		await fetchResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, "/accounts");
		await createCloudflareClient(
			COMPLIANCE_REGION_CONFIG_UNKNOWN
		).accounts.list();
		await fetchKVGetValue(COMPLIANCE_REGION_CONFIG_UNKNOWN, "id", "ns", "key");
		await fetchR2Objects(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			"/accounts/id/r2/buckets/test/objects/key"
		);
		expect(requests).toBe(4);
	});

	it("adds headers on every page", async ({ expect }) => {
		let requests = 0;
		msw.use(
			http.get("*/accounts/id/workers/scripts", ({ request }) => {
				requests++;
				expect(request.headers.get("x-custom-header")).toBe("value");
				return HttpResponse.json({
					success: true,
					result: [requests],
					result_info: { cursor: requests === 1 ? "next" : "" },
				});
			})
		);
		expect(
			await fetchListResult(
				COMPLIANCE_REGION_CONFIG_UNKNOWN,
				"/accounts/id/workers/scripts"
			)
		).toEqual([1, 2]);
		expect(requests).toBe(2);
	});

	it("adds headers to SDK requests, including retries", async ({ expect }) => {
		let requests = 0;
		msw.use(
			http.get("*/accounts", ({ request }) => {
				requests++;
				expect(request.headers.get("x-custom-header")).toBe("value");
				return requests === 1
					? new HttpResponse(null, {
							status: 503,
							headers: { "retry-after-ms": "1" },
						})
					: HttpResponse.json({
							success: true,
							result: [],
							result_info: { page: 1, total_pages: 1 },
						});
			})
		);
		await createCloudflareClient(
			COMPLIANCE_REGION_CONFIG_UNKNOWN
		).accounts.list();
		expect(requests).toBe(2);
	});

	it("adds headers to raw KV and R2 downloads", async ({ expect }) => {
		vi.stubEnv(
			"CLOUDFLARE_API_HEADERS",
			'{"X-Custom-Header":"value","User-Agent":"custom-agent"}'
		);
		msw.use(
			http.get("*/accounts/id/*", ({ request }) => {
				expect(request.headers.get("x-custom-header")).toBe("value");
				expect(request.headers.get("user-agent")).toBe("custom-agent");
				return new HttpResponse("bytes");
			})
		);
		expect(
			new TextDecoder().decode(
				await fetchKVGetValue(
					COMPLIANCE_REGION_CONFIG_UNKNOWN,
					"id",
					"ns",
					"key"
				)
			)
		).toBe("bytes");
		expect(
			await (
				await fetchR2Objects(
					COMPLIANCE_REGION_CONFIG_UNKNOWN,
					"/accounts/id/r2/buckets/test/objects/key"
				)
			)?.text()
		).toBe("bytes");
	});
});
