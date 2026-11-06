import { afterEach, describe, it, vi } from "vitest";
import { OpenAPI } from "../src/client/core/OpenAPI";
import { request } from "../src/client/core/request";

describe("request", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		OpenAPI.BASE = "";
		OpenAPI.LOGGER = undefined;
	});

	it.for([undefined, "true", "false"])(
		"always applies the container header allowlist with sanitization=%s",
		async (sanitize, { expect }) => {
			OpenAPI.BASE =
				"https://api.cloudflare.com/client/v4/accounts/account-id/containers";
			vi.stubEnv(
				"CLOUDFLARE_API_HEADERS",
				'{"X-Custom-Header":"configured-secret","X-Auth-Key":"global-key","Authorization":"Bearer token","X-Auth-Email":"user@example.com","X-Session":"session-secret"}'
			);
			vi.stubEnv("WRANGLER_LOG_SANITIZE", sanitize);
			const debugWithSanitization = vi.fn();
			OpenAPI.LOGGER = {
				debug: vi.fn(),
				debugWithSanitization,
				log: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => Response.json({ success: true, result: [] }))
			);
			await request(OpenAPI, { method: "GET", url: "/instances" });
			expect(debugWithSanitization).toHaveBeenCalledWith(
				"HEADERS:",
				expect.stringContaining('"x-custom-header": "[REDACTED]"')
			);
			const headerDiagnostics = debugWithSanitization.mock.calls.filter(
				([label]) => label === "HEADERS:"
			);
			expect(headerDiagnostics).toHaveLength(1);
			for (const [, headers] of headerDiagnostics) {
				expect(headers).toContain('"x-auth-key": "[REDACTED]"');
				expect(headers).toContain('"x-auth-email": "[REDACTED]"');
				expect(headers).toContain('"x-session": "[REDACTED]"');
				expect(headers).toContain('"accept": "application/json"');
				expect(headers).toContain('"authorization": "[REDACTED]"');
			}
		}
	);

	it("overrides unprotected headers on container API requests", async ({
		expect,
	}) => {
		OpenAPI.BASE =
			"https://api.cloudflare.com/client/v4/accounts/account-id/containers";
		vi.stubEnv(
			"CLOUDFLARE_API_HEADERS",
			'{"X-Custom-Header":"value","Authorization":"Custom configured-token"}'
		);
		const send = vi
			.fn<typeof fetch>()
			.mockImplementation(async (input, init) => {
				const outgoing = new Request(input, init);
				expect(outgoing.headers.get("x-custom-header")).toBe("value");
				expect(outgoing.headers.get("authorization")).toBe(
					"Custom configured-token"
				);
				return Response.json({ success: true, result: { id: "instance" } });
			});
		vi.stubGlobal("fetch", send);
		await request(OpenAPI, {
			method: "GET",
			url: "/instances",
			headers: {
				"X-CUSTOM-HEADER": "request-value",
				Authorization: "Bearer request-token",
			},
		});
		expect(send).toHaveBeenCalledOnce();
	});

	it("preserves raw error responses parsed from text", async ({ expect }) => {
		OpenAPI.BASE =
			"https://api.cloudflare.com/client/v4/accounts/account-id/containers";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(JSON.stringify({ error: "INVALID_INSTANCE_ID" }), {
					status: 400,
					headers: { "Content-Type": "text/plain" },
				});
			})
		);

		await expect(
			request(OpenAPI, {
				method: "GET",
				url: "/instances/invalid-id/ssh",
				errors: { 400: "Bad Request" },
			})
		).rejects.toMatchObject({
			body: { error: "INVALID_INSTANCE_ID" },
		});
	});
});
