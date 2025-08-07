import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockGetMemberships } from "./helpers/mock-oauth-flow";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

vi.unmock("../wrangler-banner");

describe("wrangler list", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	mockConsoleMethods();
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		msw.use(
			http.get("*/accounts/:accountId/workers/scripts", async () => {
				return HttpResponse.json(
					{
						result: [
							{
								id: "my-worker",
								etag: "abc123",
								created_on: "2023-01-01T00:00:00.000Z",
								modified_on: "2023-01-02T00:00:00.000Z",
								usage_model: "bundled",
								compatibility_date: "2023-01-01",
								compatibility_flags: ["nodejs_compat"],
							},
							{
								id: "another-worker",
								etag: "def456",
								created_on: "2023-01-03T00:00:00.000Z",
								modified_on: "2023-01-04T00:00:00.000Z",
								usage_model: "unbound",
							},
						],
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
	});

	it("should print as json if `--json` flag is specified, without wrangler banner", async () => {
		await runWrangler("list --json");
		expect(std.out).toMatchInlineSnapshot(`
			"[
			  {
			    \\"id\\": \\"my-worker\\",
			    \\"etag\\": \\"abc123\\",
			    \\"created_on\\": \\"2023-01-01T00:00:00.000Z\\",
			    \\"modified_on\\": \\"2023-01-02T00:00:00.000Z\\",
			    \\"usage_model\\": \\"bundled\\",
			    \\"compatibility_date\\": \\"2023-01-01\\",
			    \\"compatibility_flags\\": [
			      \\"nodejs_compat\\"
			    ]
			  },
			  {
			    \\"id\\": \\"another-worker\\",
			    \\"etag\\": \\"def456\\",
			    \\"created_on\\": \\"2023-01-03T00:00:00.000Z\\",
			    \\"modified_on\\": \\"2023-01-04T00:00:00.000Z\\",
			    \\"usage_model\\": \\"unbound\\"
			  }
			]"
		`);
	});

	it("should pretty print by default, including the wrangler banner", async () => {
		await runWrangler("list");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┬─┬─┬─┬─┐
			│ id │ etag │ created_on │ modified_on │ usage_model │ compatibility_date │ compatibility_flags │
			├─┼─┼─┼─┼─┼─┼─┤
			│ my-worker │ abc123 │ 2023-01-01T00:00:00.000Z │ 2023-01-02T00:00:00.000Z │ bundled │ 2023-01-01 │ nodejs_compat │
			├─┼─┼─┼─┼─┼─┼─┤
			│ another-worker │ def456 │ 2023-01-03T00:00:00.000Z │ 2023-01-04T00:00:00.000Z │ unbound │ │ │
			└─┴─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle empty results", async () => {
		msw.use(
			http.get("*/accounts/:accountId/workers/scripts", async () => {
				return HttpResponse.json(
					{
						result: [],
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);

		await runWrangler("list");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			No Workers found in this account."
		`);
	});

	describe("account selection", () => {
		beforeEach(() => {
			mockAccountId({ accountId: null });
		});

		it("should error if there are multiple accounts available but not interactive", async () => {
			mockGetMemberships([
				{ id: "xxx", account: { id: "1", name: "one" } },
				{ id: "yyy", account: { id: "2", name: "two" } },
			]);
			setIsTTY(false);

			await expect(runWrangler("list")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: More than one account available but unable to select one in non-interactive mode.
				Please set the appropriate \`account_id\` in your Wrangler configuration file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
				Available accounts are (\`<name>\`: \`<account_id>\`):
				  \`one\`: \`1\`
				  \`two\`: \`2\`]
			`);
		});

		it("should use CLOUDFLARE_ACCOUNT_ID when available", async () => {
			process.env.CLOUDFLARE_ACCOUNT_ID = "test-account-id";

			await runWrangler("list --json");
			expect(std.out).toContain("my-worker");

			delete process.env.CLOUDFLARE_ACCOUNT_ID;
		});
	});
});
