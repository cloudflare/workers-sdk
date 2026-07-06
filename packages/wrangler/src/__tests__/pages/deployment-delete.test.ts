import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import prompts from "prompts";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { saveToConfigCache } from "../../config-cache";
import { PAGES_CONFIG_CACHE_FILENAME } from "../../pages/constants";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type { PagesConfigCache } from "../../pages/types";
import type { ExpectStatic, Mock } from "vitest";

/** Create a mock handler for the request to delete a Pages deployment. */
function mockDeleteDeploymentRequest(
	expect: ExpectStatic,
	options: { deploymentId?: string; force?: boolean } = {}
) {
	const deploymentId = options.deploymentId ?? "abc123";

	msw.use(
		http.delete(
			"*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId",
			({ request, params }) => {
				const url = new URL(request.url);

				expect(params.accountId).toEqual("some-account-id");
				expect(params.projectName).toEqual("my-project");
				expect(params.deploymentId).toEqual(deploymentId);
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

function mockDeleteDeploymentRequests(
	expect: ExpectStatic,
	deploymentIds: string[],
	options: { force?: boolean } = {}
) {
	const expectedDeploymentIds = [...deploymentIds];

	msw.use(
		http.delete(
			"*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId",
			({ request, params }) => {
				const url = new URL(request.url);

				expect(params.accountId).toEqual("some-account-id");
				expect(params.projectName).toEqual("my-project");
				expect(params.deploymentId).toEqual(expectedDeploymentIds.shift());
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
			}
		)
	);

	return expectedDeploymentIds;
}

function mockBulkDeleteConfirmation(
	expect: ExpectStatic,
	options = { match: true }
) {
	(prompts as unknown as Mock).mockImplementationOnce(
		({ type, name, message }) => {
			expect({ type, name }).toStrictEqual({
				type: "text",
				name: "value",
			});
			expect(message).toMatch(
				/You are about to delete 2 deployments in project "my-project": abc123, def456\. Type "[A-Z]{6}" to confirm\./
			);
			const code = message.match(/Type "([A-Z]{6})" to confirm/)?.[1];
			expect(code).toBeDefined();
			return Promise.resolve({ value: options.match ? code : "WRONG" });
		}
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

	it("should delete multiple deployments after typed confirmation", async ({
		expect,
	}) => {
		const remainingDeploymentIds = mockDeleteDeploymentRequests(expect, [
			"abc123",
			"def456",
		]);
		mockBulkDeleteConfirmation(expect);

		await runWrangler(
			"pages deployment delete abc123 def456 --project-name=my-project"
		);

		expect(std.out).toContain("Deleting 2 deployments...");
		expect(std.out).toContain("Deleting deployment abc123...");
		expect(std.out).toContain("Deleted deployment abc123");
		expect(std.out).toContain("Deleting deployment def456...");
		expect(std.out).toContain("Deleted deployment def456");
		expect(std.out).toContain("Successfully deleted 2 deployments");
		expect(remainingDeploymentIds).toEqual([]);
	});

	it("should not bulk delete if the typed confirmation does not match", async ({
		expect,
	}) => {
		mockBulkDeleteConfirmation(expect, { match: false });

		await runWrangler(
			"pages deployment delete abc123 def456 --project-name=my-project"
		);

		expect(std.out).toContain(
			"Confirmation code did not match. Skipping delete."
		);
		expect(std.out).not.toContain("Successfully deleted");
	});

	it("should require --force for bulk delete in non-interactive mode", async ({
		expect,
	}) => {
		setIsTTY(false);

		await expect(
			runWrangler(
				"pages deployment delete abc123 def456 --project-name=my-project"
			)
		).rejects.toThrow(
			"The --force flag is required to delete multiple Pages deployments in non-interactive mode."
		);
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

	it("should bulk delete without asking if --force is provided", async ({
		expect,
	}) => {
		const remainingDeploymentIds = mockDeleteDeploymentRequests(
			expect,
			["abc123", "def456"],
			{ force: true }
		);

		await runWrangler(
			"pages deployment delete abc123 def456 --project-name=my-project --force"
		);

		expect(std.out).toContain("Successfully deleted 2 deployments");
		expect(remainingDeploymentIds).toEqual([]);
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
