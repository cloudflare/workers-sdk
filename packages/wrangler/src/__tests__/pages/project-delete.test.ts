import { http, HttpResponse } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("pages project delete", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
		clearDialogs();
	});

	it("should delete a project with the given name", async () => {
		msw.use(
			http.delete(
				"*/accounts/:accountId/pages/projects/:projectName",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.projectName).toEqual("some-project-name");
					return HttpResponse.json(
						{
							result: null,
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		mockConfirm({
			text: `Are you sure you want to delete "some-project-name"? This action cannot be undone.`,
			result: true,
		});

		await runWrangler("pages project delete some-project-name");

		expect(std.out).toMatchInlineSnapshot(`
		"Deleting some-project-name
		Successfully deleted some-project-name"
	`);
	});

	it("should error if no project name is specified", async () => {
		await expect(
			runWrangler("pages project delete")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing required argument: project-name]`
		);
	});

	it("should not delete a project if confirmation refused", async () => {
		mockConfirm({
			text: `Are you sure you want to delete "some-project-name-2"? This action cannot be undone.`,
			result: false,
		});

		await runWrangler("pages project delete some-project-name-2");

		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should delete a project without asking if --yes provided", async () => {
		msw.use(
			http.delete(
				"*/accounts/:accountId/pages/projects/:projectName",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.projectName).toEqual("some-project-name");
					return HttpResponse.json(
						{
							result: null,
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		await runWrangler("pages project delete some-project-name -y");

		expect(std.out).toMatchInlineSnapshot(`
		"Deleting some-project-name
		Successfully deleted some-project-name"
	`);
	});

	it("should override cached accountId with CLOUDFLARE_ACCOUNT_ID environmental variable if provided", async () => {
		msw.use(
			http.delete(
				"*/accounts/:accountId/pages/projects/:projectName",
				async ({ params }) => {
					expect(params.accountId).toEqual("new-account-id");
					return HttpResponse.json(
						{
							result: null,
							success: true,
							errors: [],
							messages: [],
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);
		mockConfirm({
			text: `Are you sure you want to delete "an-existing-project"? This action cannot be undone.`,
			result: true,
		});
		vi.mock("getConfigCache", () => {
			return {
				account_id: "original-account-id",
				project_name: "an-existing-project",
			};
		});
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "new-account-id");
		await runWrangler("pages project delete an-existing-project");
	});
});
