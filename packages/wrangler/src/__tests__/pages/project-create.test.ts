import { rest } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./../helpers/mock-account-id";
import { mockConsoleMethods } from "./../helpers/mock-console";
import { msw } from "./../helpers/msw";
import { runInTempDir } from "./../helpers/run-in-tmp";
import { runWrangler } from "./../helpers/run-wrangler";

describe("project create", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should create a project with a production branch", async () => {
		msw.use(
			rest.post(
				"*/accounts/:accountId/pages/projects",
				async (req, res, ctx) => {
					const body = await req.json();

					expect(req.params.accountId).toEqual("some-account-id");
					expect(body).toEqual({
						name: "a-new-project",
						production_branch: "main",
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								name: "a-new-project",
								subdomain: "a-new-project.pages.dev",
								production_branch: "main",
							},
						})
					);
				}
			)
		);

		await runWrangler(
			"pages project create a-new-project --production-branch=main"
		);

		expect(std.out).toMatchInlineSnapshot(`
            "✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
            To deploy a folder of assets, run 'wrangler pages publish [directory]'."
        `);
	});
});
