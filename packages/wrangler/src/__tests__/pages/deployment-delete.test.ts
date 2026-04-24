import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { saveToConfigCache } from "../../config-cache";
import { PAGES_CONFIG_CACHE_FILENAME } from "../../pages/constants";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { PagesConfigCache } from "../../pages/types";
import type { ExpectStatic } from "vitest";

/** Create a mock handler for the request to delete a Pages deployment. */
function mockDeleteDeploymentRequest(
	expect: ExpectStatic,
	options: { force?: boolean } = {}
) {
	msw.use(
		http.delete(
			"*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId",
			({ request, params }) => {
				const url = new URL(request.url);

				expect(params.accountId).toEqual("some-account-id");
				expect(params.projectName).toEqual("my-project");
				expect(params.deploymentId).toEqual("abc123");
				expect(url.searchParams.get("force")).toEqual(
					options.force ? "true" : "false"
				);

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
}

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

	it("should delete a deployment with the given ID", async ({ expect }) => {
		mockDeleteDeploymentRequest(expect);

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

	it("should error if no deployment ID is specified", async ({ expect }) => {
		await expect(
			runWrangler("pages deployment delete --project-name=my-project")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Not enough non-option arguments: got 0, need at least 1]`
		);
	});

	it("should not delete if confirmation refused", async ({ expect }) => {
		mockConfirm({
			text: `Are you sure you want to delete deployment "abc123" in project "my-project"? This action cannot be undone.`,
			result: false,
		});

		await runWrangler(
			"pages deployment delete abc123 --project-name=my-project"
		);

		expect(std.out).not.toContain("Successfully deleted");
	});

	it("should delete without asking if --force is provided", async ({
		expect,
	}) => {
		mockDeleteDeploymentRequest(expect, { force: true });

		await runWrangler(
			"pages deployment delete abc123 --project-name=my-project --force"
		);

		expect(std.out).toContain("Successfully deleted deployment abc123");
	});

	it("should support -f alias for --force", async ({ expect }) => {
		mockDeleteDeploymentRequest(expect, { force: true });

		await runWrangler(
			"pages deployment delete abc123 --project-name=my-project -f"
		);

		expect(std.out).toContain("Successfully deleted deployment abc123");
	});

	it("should prefer CLOUDFLARE_ACCOUNT_ID over cached account id", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-var-account-id");

		saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
			account_id: "stale-cached-account-id",
			project_name: "my-project",
		});

		msw.use(
			http.delete(
				"*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId",
				({ params }) => {
					expect(params.accountId).toEqual("env-var-account-id");
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
	});
});
