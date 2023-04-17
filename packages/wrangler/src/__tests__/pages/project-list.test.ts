import { rest } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockAccountId, mockApiToken } from "./../helpers/mock-account-id";
import { msw } from "./../helpers/msw";
import { runInTempDir } from "./../helpers/run-in-tmp";
import { runWrangler } from "./../helpers/run-wrangler";
import type { Project } from "./../../pages/types";

describe("project list", () => {
	runInTempDir();
	mockConsoleMethods();
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
});

/* -------------------------------------------------- */
/*                    Helper Functions                */
/* -------------------------------------------------- */

function mockProjectListRequest(projects: unknown[]) {
	const requests = { count: 0 };
	msw.use(
		rest.get("*/accounts/:accountId/pages/projects", async (req, res, ctx) => {
			requests.count++;
			const pageSize = Number(req.url.searchParams.get("per_page"));
			const page = Number(req.url.searchParams.get("page"));
			const expectedPageSize = 10;
			const expectedPage = requests.count;
			expect(req.params.accountId).toEqual("some-account-id");
			expect(pageSize).toEqual(expectedPageSize);
			expect(page).toEqual(expectedPage);
			expect(await req.text()).toEqual("");

			return res(
				ctx.status(200),
				ctx.json({
					success: true,
					errors: [],
					messages: [],
					result: projects.slice((page - 1) * pageSize, page * pageSize),
				})
			);
		})
	);
	return requests;
}
