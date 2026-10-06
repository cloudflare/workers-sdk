import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { saveToConfigCache } from "../../config-cache";
import { PAGES_CONFIG_CACHE_FILENAME } from "../../pages/constants";
import { detectAgent } from "../../utils/detect-agent";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./../helpers/mock-account-id";
import { mockConsoleMethods } from "./../helpers/mock-console";
import { msw } from "./../helpers/msw";
import { runWrangler } from "./../helpers/run-wrangler";
import type { PagesConfigCache } from "../../pages/types";

vi.mock("../../utils/detect-agent");

describe("pages project create", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();

	beforeEach(() => {
		vi.mocked(detectAgent).mockReturnValue({ isAgent: false, id: null });
	});

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should create a project with a production branch", async ({ expect }) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/pages/projects",
				async ({ request, params }) => {
					const body = (await request.json()) as Record<string, unknown>;

					expect(params.accountId).toEqual("some-account-id");
					expect(body).toEqual({
						name: "a-new-project",
						production_branch: "main",
						deployment_configs: {
							preview: {},
							production: {},
						},
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								...body,
								subdomain: "a-new-project.pages.dev",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			"pages project create a-new-project --production-branch=main"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
			To deploy a folder of assets, run 'wrangler pages deploy [directory]'."
		`);
	});

	it("does not delegate an agent create when the project name already exists", async ({
		expect,
	}) => {
		vi.mocked(detectAgent).mockReturnValue({
			isAgent: true,
			id: "test-agent",
		});
		let pagesCreateRequested = false;
		msw.use(
			http.get(
				"*/accounts/:accountId/pages/projects/an-existing-project",
				() =>
					HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: { name: "an-existing-project" },
					}),
				{ once: true }
			),
			http.post(
				"*/accounts/:accountId/pages/projects",
				() => {
					pagesCreateRequested = true;
					return HttpResponse.json(
						{
							success: false,
							errors: [{ code: 8000000, message: "Project already exists" }],
							messages: [],
							result: null,
						},
						{ status: 409 }
					);
				},
				{ once: true }
			)
		);

		await expect(
			runWrangler(
				"pages project create an-existing-project --production-branch=main"
			)
		).rejects.toThrow(
			"A request to the Cloudflare API (/accounts/some-account-id/pages/projects) failed."
		);
		expect(pagesCreateRequested).toBe(true);
		expect(std.out).not.toContain("Delegating to");
	});

	it("should create a project with compatibility flags", async ({ expect }) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/pages/projects",
				async ({ request }) => {
					const body = (await request.json()) as Record<string, unknown>;
					expect(body).toEqual({
						name: "a-new-project",
						production_branch: "main",
						deployment_configs: {
							production: { compatibility_flags: ["foo", "bar"] },
							preview: { compatibility_flags: ["foo", "bar"] },
						},
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								...body,
								subdomain: "a-new-project.pages.dev",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			"pages project create a-new-project --production-branch=main --compatibility-flags foo bar"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
			To deploy a folder of assets, run 'wrangler pages deploy [directory]'."
		`);
	});

	it("should create a project with a compatibility date", async ({
		expect,
	}) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/pages/projects",
				async ({ request }) => {
					const body = (await request.json()) as Record<string, unknown>;
					expect(body).toEqual({
						name: "a-new-project",
						production_branch: "main",
						deployment_configs: {
							production: { compatibility_date: "2022-03-08" },
							preview: { compatibility_date: "2022-03-08" },
						},
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								...body,
								subdomain: "a-new-project.pages.dev",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			"pages project create a-new-project --production-branch=main --compatibility-date 2022-03-08"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
			To deploy a folder of assets, run 'wrangler pages deploy [directory]'."
		`);
	});

	it("should override cached accountId with CLOUDFLARE_ACCOUNT_ID environmental variable if provided", async ({
		expect,
	}) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/pages/projects",
				async ({ request, params }) => {
					const body = (await request.json()) as Record<string, unknown>;
					expect(params.accountId).toEqual("new-account-id");
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								...body,
								subdomain: "an-existing-project.pages.dev",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);
		saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
			account_id: "original-account-id",
			project_name: "an-existing-project",
		});
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "new-account-id");
		await runWrangler(
			"pages project create an-existing-project --production-branch=main --compatibility-date 2022-03-08"
		);
	});
});
