import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

// we want to include the banner to make sure it doesn't show up in the output when
// when --json=true
vi.unmock("../../wrangler-banner");
describe("list", () => {
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
			http.get("*/accounts/:accountId/d1/database", async () => {
				return HttpResponse.json(
					{
						result: [
							{
								uuid: "1",
								name: "a",
								binding: "A",
							},
							{
								uuid: "2",
								name: "b",
								binding: "B",
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
		await runWrangler("d1 list --json");
		expect(std.out).toMatchInlineSnapshot(`
			"[
			  {
			    \\"uuid\\": \\"1\\",
			    \\"name\\": \\"a\\",
			    \\"binding\\": \\"A\\"
			  },
			  {
			    \\"uuid\\": \\"2\\",
			    \\"name\\": \\"b\\",
			    \\"binding\\": \\"B\\"
			  }
			]"
		`);
	});

	it("should pretty print by default, including the wrangler banner", async () => {
		await runWrangler("d1 list");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			------------------

			┌──────┬──────┬─────────┐
			│ uuid │ name │ binding │
			├──────┼──────┼─────────┤
			│ 1    │ a    │ A       │
			├──────┼──────┼─────────┤
			│ 2    │ b    │ B       │
			└──────┴──────┴─────────┘"
		`);
	});
});
