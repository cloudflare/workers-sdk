import { http, HttpResponse } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

const PROJECT_NAME = "images";
const DEPLOYMENT = "deployment";

describe("pages deployment delete", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockConsoleMethods();

	afterEach(async () => {
		await endEventLoop();
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should make request to delete deployment", async () => {
		const requests = mockDeploymentDeleteRequest(DEPLOYMENT);
		await runWrangler(
			`pages deployment delete ${DEPLOYMENT} --project-name=${PROJECT_NAME}`
		);
		expect(requests.count).toBe(1);
	});

	it("should throw an error if deployment ID is missing", async () => {
		await expect(
			runWrangler(`pages deployment delete --project-name=${PROJECT_NAME}`)
		).rejects.toThrow("Must specify a project name and deployment.");
	});

	it("should throw an error if project name is missing in non-interactive mode", async () => {
		await expect(
			runWrangler(`pages deployment delete ${DEPLOYMENT}`)
		).rejects.toThrow("Must specify a project name in non-interactive mode.");
	});
});

/* -------------------------------------------------- */
/*                    Helper Functions                */
/* -------------------------------------------------- */

type RequestLogger = {
	count: number;
	queryParams: [string, string][][];
};

function mockDeploymentDeleteRequest(deployment: string): RequestLogger {
	const requests: RequestLogger = { count: 0, queryParams: [] };
	msw.use(
		http.delete(
			"*/accounts/:accountId/pages/projects/:project/deployments/:deployment",
			({ request, params }) => {
				requests.count++;
				const url = new URL(request.url);
				requests.queryParams.push(Array.from(url.searchParams.entries()));
				expect(params.project).toEqual(PROJECT_NAME);
				expect(params.accountId).toEqual("some-account-id");

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: deployment,
					},
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);
	return requests;
}
