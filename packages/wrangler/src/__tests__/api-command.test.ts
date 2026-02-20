import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler api", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
	});

	it("should error if no endpoint is provided", async ({ expect }) => {
		await expect(runWrangler("api")).rejects.toThrowError(
			/Not enough non-option arguments/
		);
	});

	it("should error if endpoint does not start with /", async ({ expect }) => {
		await expect(runWrangler("api zones")).rejects.toThrowError(
			/Endpoint must start with "\/"/
		);
	});

	it("should make a GET request and output JSON", async ({ expect }) => {
		const zones = [
			{ id: "zone-1", name: "example.com" },
			{ id: "zone-2", name: "example.org" },
		];

		msw.use(
			http.get(
				"*/zones",
				() => {
					return HttpResponse.json(createFetchResult(zones));
				},
				{ once: true }
			)
		);

		await runWrangler("api /zones");

		const output = JSON.parse(std.out);
		expect(output.success).toBe(true);
		expect(output.result).toEqual(zones);
	});

	it("should pass custom headers", async ({ expect }) => {
		msw.use(
			http.get(
				"*/zones",
				({ request }) => {
					const customHeader = request.headers.get("X-Custom-Header");
					return HttpResponse.json(
						createFetchResult({ receivedHeader: customHeader })
					);
				},
				{ once: true }
			)
		);

		await runWrangler('api /zones -H "X-Custom-Header: my-value"');

		const output = JSON.parse(std.out);
		expect(output.result.receivedHeader).toBe("my-value");
	});

	it("should support multiple custom headers", async ({ expect }) => {
		msw.use(
			http.get(
				"*/zones",
				({ request }) => {
					return HttpResponse.json(
						createFetchResult({
							header1: request.headers.get("X-Header-1"),
							header2: request.headers.get("X-Header-2"),
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			'api /zones -H "X-Header-1: value1" -H "X-Header-2: value2"'
		);

		const output = JSON.parse(std.out);
		expect(output.result.header1).toBe("value1");
		expect(output.result.header2).toBe("value2");
	});

	it("should replace :account_id with resolved account ID", async ({
		expect,
	}) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts",
				({ params }) => {
					return HttpResponse.json(
						createFetchResult({ accountId: params["accountId"] })
					);
				},
				{ once: true }
			)
		);

		await runWrangler("api /accounts/:account_id/workers/scripts");

		const output = JSON.parse(std.out);
		expect(output.result.accountId).toBe("some-account-id");
	});

	it("should use --account-id flag for :account_id replacement", async ({
		expect,
	}) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts",
				({ params }) => {
					return HttpResponse.json(
						createFetchResult({ accountId: params["accountId"] })
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			"api /accounts/:account_id/workers/scripts --account-id custom-account-123"
		);

		const output = JSON.parse(std.out);
		expect(output.result.accountId).toBe("custom-account-123");
	});

	it("should not resolve account ID when :account_id is not in the endpoint", async ({
		expect,
	}) => {
		msw.use(
			http.get(
				"*/zones",
				() => {
					return HttpResponse.json(createFetchResult([]));
				},
				{ once: true }
			)
		);

		// This should work without needing account ID resolution
		await runWrangler("api /zones");

		const output = JSON.parse(std.out);
		expect(output.success).toBe(true);
	});

	it("should show a hint on 403 responses", async ({ expect }) => {
		msw.use(
			http.get(
				"*/zones",
				() => {
					return HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 9109, message: "Forbidden" },
						]),
						{ status: 403 }
					);
				},
				{ once: true }
			)
		);

		await runWrangler("api /zones");

		expect(std.out).toContain("Forbidden");
		expect(std.warn).toContain(
			"You may need to re-authenticate with additional scopes"
		);
		expect(std.warn).toContain("wrangler login");
	});

	it("should handle non-JSON responses", async ({ expect }) => {
		msw.use(
			http.get(
				"*/zones",
				() => {
					return new HttpResponse("plain text response", {
						status: 200,
						headers: { "Content-Type": "text/plain" },
					});
				},
				{ once: true }
			)
		);

		await runWrangler("api /zones");

		expect(std.out).toContain("plain text response");
	});

	it("should error on invalid header format", async ({ expect }) => {
		await expect(
			runWrangler('api /zones -H "bad-header-no-colon"')
		).rejects.toThrowError(/Invalid header format/);
	});

	it("should error on empty header name", async ({ expect }) => {
		await expect(
			runWrangler('api /zones -H ": some-value"')
		).rejects.toThrowError(/Header name cannot be empty/);
	});

	it("should pretty-print JSON output", async ({ expect }) => {
		msw.use(
			http.get(
				"*/zones",
				() => {
					return HttpResponse.json(createFetchResult({ id: "test" }));
				},
				{ once: true }
			)
		);

		await runWrangler("api /zones");

		// Output should be indented (pretty-printed)
		expect(std.out).toContain("  ");
		expect(std.out).toContain('"success": true');
	});
});
