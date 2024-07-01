import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("info", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	mockConsoleMethods();
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	it("should display version when alpha", async () => {
		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		writeWranglerToml({
			d1_databases: [
				{
					binding: "DB",
					database_name: "northwind",
					database_id: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
				},
			],
		});
		msw.use(
			http.get("*/accounts/:accountId/d1/database/*", async () => {
				return HttpResponse.json(
					{
						result: {
							uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
							name: "northwind",
							created_at: "2023-05-23T08:33:54.590Z",
							version: "alpha",
							num_tables: 13,
							file_size: 33067008,
							running_in_region: "WEUR",
						},
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		await runWrangler("d1 info northwind --json");
		expect(std.out).toMatchInlineSnapshot(`
		"{
		  \\"uuid\\": \\"d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06\\",
		  \\"name\\": \\"northwind\\",
		  \\"created_at\\": \\"2023-05-23T08:33:54.590Z\\",
		  \\"version\\": \\"alpha\\",
		  \\"num_tables\\": 13,
		  \\"running_in_region\\": \\"WEUR\\",
		  \\"database_size\\": 33067008
		}"
	`);
	});

	it("should not display version when not alpha", async () => {
		setIsTTY(false);
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		writeWranglerToml({
			d1_databases: [
				{
					binding: "DB",
					database_name: "northwind",
					database_id: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
				},
			],
		});
		msw.use(
			http.get("*/accounts/:accountId/d1/database/*", async () => {
				return HttpResponse.json(
					{
						result: {
							uuid: "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
							name: "northwind",
							created_at: "2023-05-23T08:33:54.590Z",
							version: "beta",
							num_tables: 13,
							file_size: 33067008,
							running_in_region: "WEUR",
						},
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		msw.use(
			http.post("*/graphql", async () => {
				return HttpResponse.json(
					{
						result: null,
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		await runWrangler("d1 info northwind --json");
		expect(std.out).toMatchInlineSnapshot(`
		"{
		  \\"uuid\\": \\"d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06\\",
		  \\"name\\": \\"northwind\\",
		  \\"created_at\\": \\"2023-05-23T08:33:54.590Z\\",
		  \\"num_tables\\": 13,
		  \\"running_in_region\\": \\"WEUR\\",
		  \\"database_size\\": 33067008,
		  \\"read_queries_24h\\": 0,
		  \\"write_queries_24h\\": 0,
		  \\"rows_read_24h\\": 0,
		  \\"rows_written_24h\\": 0
		}"
	`);
	});
});
