import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("pages deployment delete", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(async () => {
		await endEventLoop();
		msw.resetHandlers();
		msw.restoreHandlers();
		clearDialogs();
	});

	it("should delete a deployment with the given ID", async () => {
		msw.use(
			http.delete(
				"*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.projectName).toEqual("my-project");
					expect(params.deploymentId).toEqual("abc123");
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
			text: `Are you sure you want to delete deployment "abc123" in project "my-project"? This action cannot be undone.`,
			result: true,
		});

		await runWrangler(
			"pages deployment delete abc123 --project-name=my-project"
		);

		expect(std.out).toContain("Deleting deployment abc123...");
		expect(std.out).toContain("Successfully deleted deployment abc123");
	});

	it("should error if no deployment ID is specified", async () => {
		await expect(
			runWrangler("pages deployment delete --project-name=my-project")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Not enough non-option arguments: got 0, need at least 1]`
		);
	});

	it("should not delete if confirmation refused", async () => {
		mockConfirm({
			text: `Are you sure you want to delete deployment "abc123" in project "my-project"? This action cannot be undone.`,
			result: false,
		});

		await runWrangler(
			"pages deployment delete abc123 --project-name=my-project"
		);

		expect(std.out).not.toContain("Successfully deleted");
	});

	it("should delete without asking if --force is provided", async () => {
		msw.use(
			http.delete(
				"*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.projectName).toEqual("my-project");
					expect(params.deploymentId).toEqual("abc123");
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

		await runWrangler(
			"pages deployment delete abc123 --project-name=my-project --force"
		);

		expect(std.out).toContain("Successfully deleted deployment abc123");
	});

	it("should support -f alias for --force", async () => {
		msw.use(
			http.delete(
				"*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId",
				async () => {
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

		await runWrangler(
			"pages deployment delete abc123 --project-name=my-project -f"
		);

		expect(std.out).toContain("Successfully deleted deployment abc123");
	});
});
