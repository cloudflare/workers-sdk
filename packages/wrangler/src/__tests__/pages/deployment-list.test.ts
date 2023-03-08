import { rest } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockAccountId, mockApiToken } from "./../helpers/mock-account-id";
import { msw } from "./../helpers/msw";
import { runInTempDir } from "./../helpers/run-in-tmp";
import { runWrangler } from "./../helpers/run-wrangler";
import type { Deployment } from "./../../pages/types";

describe("deployment list", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockConsoleMethods();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should make request to list deployments", async () => {
		const deployments: Deployment[] = [
			{
				id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
				url: "https://87bbc8fe.images.pages.dev",
				environment: "preview",
				created_on: "2021-11-17T14:52:26.133835Z",
				latest_stage: {
					ended_on: "2021-11-17T14:52:26.133835Z",
					status: "success",
				},
				deployment_trigger: {
					metadata: {
						branch: "main",
						commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
					},
				},
				project_name: "images",
			},
		];

		const requests = mockDeploymentListRequest(deployments);
		await runWrangler("pages deployment list --project-name=images");

		expect(requests.count).toBe(1);
	});
});

/* -------------------------------------------------- */
/*                    Helper Functions                */
/* -------------------------------------------------- */

function mockDeploymentListRequest(deployments: unknown[]) {
	const requests = { count: 0 };
	msw.use(
		rest.get(
			"*/accounts/:accountId/pages/projects/:project/deployments",
			(req, res, ctx) => {
				requests.count++;

				expect(req.params.project).toEqual("images");
				expect(req.params.accountId).toEqual("some-account-id");

				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: deployments,
					})
				);
			}
		)
	);
	return requests;
}
