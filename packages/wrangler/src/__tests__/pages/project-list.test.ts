import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { afterEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockAccountId, mockApiToken } from "./../helpers/mock-account-id";
import { msw } from "./../helpers/msw";
import { runInTempDir } from "./../helpers/run-in-tmp";
import { runWrangler } from "./../helpers/run-wrangler";
import type { Project } from "./../../pages/types";

describe("pages project list", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should make request to list projects", async () => {
		const projects: Project[] = [
			{
				name: "dogs",
				subdomain: "docs.pages.dev",
				domains: ["dogs.pages.dev"],
				source: {
					type: "github",
				},
				latest_deployment: {
					modified_on: "2021-11-17T14:52:26.133835Z",
				},
				created_on: "2021-11-17T14:52:26.133835Z",
				production_branch: "main",
			},
			{
				name: "cats",
				subdomain: "cats.pages.dev",
				domains: ["cats.pages.dev", "kitten.com"],
				latest_deployment: {
					modified_on: "2021-11-17T14:52:26.133835Z",
				},
				created_on: "2021-11-17T14:52:26.133835Z",
				production_branch: "main",
			},
		];

		const requests = mockProjectListRequest(projects);
		await runWrangler("pages project list");

		expect(requests.count).toBe(1);
	});

	it("should make multiple requests for paginated results", async () => {
		const projects: Project[] = [];
		for (let i = 0; i < 15; i++) {
			projects.push({
				name: "dogs" + i,
				subdomain: i + "dogs.pages.dev",
				domains: [i + "dogs.pages.dev"],
				source: {
					type: "github",
				},
				latest_deployment: {
					modified_on: "2021-11-17T14:52:26.133835Z",
				},
				created_on: "2021-11-17T14:52:26.133835Z",
				production_branch: "main",
			});
		}
		const requests = mockProjectListRequest(projects);
		await runWrangler("pages project list");
		expect(requests.count).toEqual(2);
	});

	it("should override cached accountId with CLOUDFLARE_ACCOUNT_ID environmental variable if provided", async () => {
		vi.mock("getConfigCache", () => {
			return {
				account_id: "original-account-id",
				project_name: "an-existing-project",
			};
		});
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "new-account-id");
		const requests = mockProjectListRequest([], "new-account-id");
		await runWrangler("pages project list");
		expect(requests.count).toBe(1);
	});

	it("should return JSON output when --json flag is provided", async () => {
		const projects: Project[] = [
			{
				name: "dogs",
				subdomain: "docs.pages.dev",
				domains: ["dogs.pages.dev"],
				source: {
					type: "github",
				},
				latest_deployment: {
					modified_on: "2021-11-17T14:52:26.133835Z",
				},
				created_on: "2021-11-17T14:52:26.133835Z",
				production_branch: "main",
			},
			{
				name: "cats",
				subdomain: "cats.pages.dev",
				domains: ["cats.pages.dev", "kitten.com"],
				latest_deployment: {
					modified_on: "2021-11-17T14:52:26.133835Z",
				},
				created_on: "2021-11-17T14:52:26.133835Z",
				production_branch: "main",
			},
		];

		const requests = mockProjectListRequest(projects);
		await runWrangler("pages project list --json");

		expect(requests.count).toBe(1);

		// Verify the output is valid JSON
		const output = JSON.parse(std.out);
		expect(output).toMatchInlineSnapshot(`
			[
			  {
			    "Git Provider": "Yes",
			    "Last Modified": "[mock-time-ago]",
			    "Project Domains": "dogs.pages.dev",
			    "Project Name": "dogs",
			  },
			  {
			    "Git Provider": "No",
			    "Last Modified": "[mock-time-ago]",
			    "Project Domains": "cats.pages.dev, kitten.com",
			    "Project Name": "cats",
			  },
			]
		`);
	});
});

/* -------------------------------------------------- */
/*                    Helper Functions                */
/* -------------------------------------------------- */

function mockProjectListRequest(
	projects: unknown[],
	accountId = "some-account-id"
) {
	const requests = { count: 0 };
	msw.use(
		http.get(
			"*/accounts/:accountId/pages/projects",
			async ({ request, params }) => {
				const url = new URL(request.url);

				requests.count++;
				const pageSize = Number(url.searchParams.get("per_page"));
				const page = Number(url.searchParams.get("page"));
				const expectedPageSize = 10;
				const expectedPage = requests.count;
				expect(params.accountId).toEqual(accountId);
				expect(pageSize).toEqual(expectedPageSize);
				expect(page).toEqual(expectedPage);
				expect(await request.text()).toEqual("");

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: projects.slice((page - 1) * pageSize, page * pageSize),
					},
					{ status: 200 }
				);
			}
		)
	);
	return requests;
}
