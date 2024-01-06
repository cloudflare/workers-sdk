import { http, HttpResponse } from "msw";
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
			http.post<{ accountId: string }, Record<string, unknown>>(
				"*/accounts/:accountId/pages/projects",
				async ({ request, params }) => {
					const body = await request.json();

					expect(params.accountId).toEqual("some-account-id");
					expect(body).toEqual({
						name: "a-new-project",
						production_branch: "main",
						deployment_configs: {
							preview: {},
							production: {},
						},
					});

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							...body,
							subdomain: "a-new-project.pages.dev",
						},
					});
				},
				{ once: true }
			)
		);

		await runWrangler(
			"pages project create a-new-project --production-branch=main"
		);

		expect(std.out).toMatchInlineSnapshot(`
            "✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
            To deploy a folder of assets, run 'wrangler pages deploy [directory]'."
        `);
	});

	it("should create a project with compatibility flags", async () => {
		msw.use(
			http.post<{}, Record<string, unknown>>(
				"*/accounts/:accountId/pages/projects",
				async ({ request }) => {
					const body = await request.json();
					expect(body).toEqual({
						name: "a-new-project",
						production_branch: "main",
						deployment_configs: {
							production: { compatibility_flags: ["foo", "bar"] },
							preview: { compatibility_flags: ["foo", "bar"] },
						},
					});

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							...body,
							subdomain: "a-new-project.pages.dev",
						},
					});
				},
				{ once: true }
			)
		);

		await runWrangler(
			"pages project create a-new-project --production-branch=main --compatibility-flags foo bar"
		);

		expect(std.out).toMatchInlineSnapshot(`
            "✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
            To deploy a folder of assets, run 'wrangler pages deploy [directory]'."
        `);
	});

	it("should create a project with a compatibility date", async () => {
		msw.use(
			http.post<{}, Record<string, unknown>>(
				"*/accounts/:accountId/pages/projects",
				async ({ request }) => {
					const body = await request.json();
					expect(body).toEqual({
						name: "a-new-project",
						production_branch: "main",
						deployment_configs: {
							production: { compatibility_date: "2022-03-08" },
							preview: { compatibility_date: "2022-03-08" },
						},
					});

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							...body,
							subdomain: "a-new-project.pages.dev",
						},
					});
				},
				{ once: true }
			)
		);

		await runWrangler(
			"pages project create a-new-project --production-branch=main --compatibility-date 2022-03-08"
		);

		expect(std.out).toMatchInlineSnapshot(`
            "✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
            To deploy a folder of assets, run 'wrangler pages deploy [directory]'."
        `);
	});
});
