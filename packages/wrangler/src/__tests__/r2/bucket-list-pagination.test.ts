import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/15103
describe("r2 bucket list pagination", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	useMockIsTTY();

	it("should list every bucket when the account has more than one page of buckets", async () => {
		const all = Array.from({ length: 45 }, (_, i) => ({
			name: `bucket-${String(i).padStart(2, "0")}`,
			creation_date: "01-01-2001",
		}));
		// Simulates the API: 20 buckets per page by default, `per_page` and
		// `start_after` honoured.
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets", ({ request }) => {
				const url = new URL(request.url);
				const perPage = Number(url.searchParams.get("per_page") ?? 20);
				const startAfter = url.searchParams.get("start_after");
				const remaining = startAfter
					? all.filter((b) => b.name > startAfter)
					: all;
				return HttpResponse.json(
					createFetchResult({ buckets: remaining.slice(0, perPage) })
				);
			})
		);

		await runWrangler(`r2 bucket list`);

		for (const bucket of all) {
			expect(std.out).toContain(bucket.name);
		}
	});
});
