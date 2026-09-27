import { mkdirSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { runPagesToWorkersDeploy } from "../../pages/run-workers-deploy";
import { detectAgent } from "../../utils/detect-agent";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

vi.mock("../../pages/run-workers-deploy");
vi.mock("../../utils/detect-agent");

describe("Pages-to-Workers command delegation", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockConsoleMethods();

	beforeEach(() => {
		vi.mocked(detectAgent).mockReturnValue({
			isAgent: true,
			id: "test-agent",
		});
	});

	afterEach(async () => {
		await endEventLoop();
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("delegates a new Pages deploy when the account already has another Pages project", async ({
		expect,
	}) => {
		const requests = mockAccountWithAnotherPagesProject();
		let pagesDeploymentRequests = 0;
		msw.use(
			http.post(
				"*/accounts/some-account-id/pages/projects/new-project/deployments",
				() => {
					pagesDeploymentRequests++;
					return HttpResponse.error();
				}
			)
		);
		mkdirSync("public");
		writeFileSync("public/index.html", "hello");

		// Establish through the API that this account already contains a different
		// Pages project before targeting a new name.
		await runWrangler("pages project list --json");
		await runWrangler("pages deploy public --project-name=new-project");

		expect(requests).toEqual({ list: 1, targetLookup: 1 });
		expect(runPagesToWorkersDeploy).toHaveBeenCalledWith({
			delegate: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: { name: "new-project" },
		});
		expect(pagesDeploymentRequests).toBe(0);
	});

	it("delegates a new Pages project create when the account already has another Pages project", async ({
		expect,
	}) => {
		const requests = mockAccountWithAnotherPagesProject();
		let pagesCreateRequests = 0;
		msw.use(
			http.post("*/accounts/some-account-id/pages/projects", () => {
				pagesCreateRequests++;
				return HttpResponse.error();
			})
		);

		await runWrangler("pages project list --json");
		await runWrangler(
			"pages project create new-project --production-branch=main"
		);

		expect(requests).toEqual({ list: 1, targetLookup: 1 });
		expect(runPagesToWorkersDeploy).toHaveBeenCalledWith({
			delegate: true,
			command: "create",
			agentId: "test-agent",
			deployArgs: { name: "new-project" },
		});
		expect(pagesCreateRequests).toBe(0);
	});
});

function mockAccountWithAnotherPagesProject(): {
	list: number;
	targetLookup: number;
} {
	const requests = { list: 0, targetLookup: 0 };
	msw.use(
		http.get("*/accounts/some-account-id/pages/projects", () => {
			requests.list++;
			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: [
					{
						name: "existing-project",
						domains: ["existing-project.pages.dev"],
						source: null,
						created_on: "2026-09-08T00:00:00.000Z",
					},
				],
			});
		}),
		http.get(
			"*/accounts/some-account-id/pages/projects/new-project",
			() => {
				requests.targetLookup++;
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 8000007, message: "Project not found" }],
						messages: [],
						result: null,
					},
					{ status: 404 }
				);
			},
			{ once: true }
		)
	);
	return requests;
}
