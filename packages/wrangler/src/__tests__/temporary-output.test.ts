import { TEMPORARY_TERMS_NOTICE } from "@cloudflare/workers-auth";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
import { logger } from "../logger";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockProcess } from "./helpers/mock-process";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

const temporaryPreviewAccountUrl =
	"https://api.cloudflare.com/client/v4/provisioning/previews";

/** Mocks the temporary preview-account challenge and creation endpoints. */
function mockTemporaryPreviewAccount(): void {
	msw.use(
		// Small k/g so the proof-of-work solve is instant.
		http.post(`${temporaryPreviewAccountUrl}/challenge`, () =>
			HttpResponse.json(
				createFetchResult({
					challengeToken: "challenge-token",
					seed: Buffer.alloc(32, 1).toString("base64url"),
					k: 2,
					g: 2,
					s: 16,
					expiresAt: 9999999999,
				})
			)
		),
		http.post(temporaryPreviewAccountUrl, () =>
			HttpResponse.json(
				createFetchResult({
					account: {
						id: "preview-account-id",
						name: "Preview Account Alpha",
						apiToken: "preview-account-token",
						expiresAt: "2027-01-01T00:00:00.000Z",
					},
					claim: {
						url: "https://dash.cloudflare.com/claim-preview",
						expiresAt: "2027-01-02T00:00:00.000Z",
					},
				})
			)
		)
	);
}

describe("temporary account notices", () => {
	mockApiToken({ apiToken: null });
	mockAccountId({ accountId: null });
	runInTempDir();
	const std = mockConsoleMethods();
	const proc = mockProcess();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		logger.resetLoggerLevel();
		// Non-interactive mode prints the terms notice instead of prompting.
		setIsTTY(false);
		mockTemporaryPreviewAccount();
	});

	afterEach(() => {
		logger.resetLoggerLevel();
	});

	it("keeps JSON output on stdout parseable", async ({ expect }) => {
		const namespaces = [{ id: "id-1", title: "title-1" }];
		msw.use(
			http.get(
				"*/accounts/preview-account-id/storage/kv/namespaces",
				({ request }) => {
					// The SDK keeps paging until it receives an empty page.
					const page = new URL(request.url).searchParams.get("page") ?? "1";
					return HttpResponse.json(
						createFetchResult(page === "1" ? namespaces : [])
					);
				}
			)
		);

		await runWrangler("kv namespace list --temporary");

		expect(JSON.parse(std.out)).toEqual(namespaces);
		expect(std.err).toContain(TEMPORARY_TERMS_NOTICE);
		expect(std.err).toContain("Solving proof-of-work challenge");
		expect(std.err).toContain("Temporary account ready:");
		expect(std.err).toContain(
			"Claim URL: https://dash.cloudflare.com/claim-preview"
		);
	});

	it("keeps raw values written to stdout intact", async ({ expect }) => {
		msw.use(
			http.get(
				"*/accounts/preview-account-id/storage/kv/namespaces/some-namespace-id/values/my-key",
				() => HttpResponse.text("my-value")
			)
		);

		await runWrangler(
			"kv key get --remote my-key --namespace-id some-namespace-id --temporary"
		);

		expect(proc.write).toEqual(Buffer.from("my-value"));
		expect(std.out).not.toContain("Temporary account ready:");
		expect(std.err).toContain("Temporary account ready:");
	});

	describe("with a --json command that lowers the log level", () => {
		const results = [
			{ results: [{ result: 1 }], success: true, meta: { duration: 1 } },
		];
		let queryRequests = 0;

		beforeEach(() => {
			queryRequests = 0;
			writeWranglerConfig({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});
			msw.use(
				http.get("*/accounts/preview-account-id/d1/database", () =>
					HttpResponse.json(
						createFetchResult([
							{ uuid: "xxxx", name: "db", created_at: "", version: "alpha" },
						])
					)
				),
				http.post(
					"*/accounts/preview-account-id/d1/database/xxxx/query",
					() => {
						queryRequests++;
						return HttpResponse.json(createFetchResult(results));
					}
				)
			);
		});

		it("still shows the claim URL", async ({ expect }) => {
			await runWrangler(
				"d1 execute db --command 'select 1;' --remote --json --temporary"
			);

			expect(JSON.parse(std.out)).toEqual(results);
			expect(std.err).toContain(
				"Claim URL: https://dash.cloudflare.com/claim-preview"
			);
		});

		it("prints nothing when logging is disabled", async ({ expect }) => {
			await runWrangler(
				"d1 execute db --command 'select 1;' --remote --json --temporary",
				{ WRANGLER_LOG: "none" }
			);

			expect(queryRequests).toBe(1);
			expect(std.err).toBe("");
		});
	});
});
