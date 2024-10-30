import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerToml } from "./helpers/write-wrangler-toml";
import type { Instance } from "../workflows/types";

describe("wrangler workflows", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	describe("instances pause", () => {
		const mockGetInstances = async (instances: Instance[]) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workflows/some-workflow/instances`,
					async () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: instances,
						});
					},
					{ once: true }
				)
			);
		};
		const mockPauseRequest = async (expectedInstance: string) => {
			msw.use(
				http.patch(
					`*/accounts/:accountId/workflows/some-workflow/instances/:instanceId/status`,
					async ({ params }) => {
						expect(params.instanceId).toEqual(expectedInstance);
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {},
						});
					},
					{ once: true }
				)
			);
		};

		it("should get and pause the latest instance given a name", async () => {
			writeWranglerToml();
			const mockInstances: Instance[] = [
				{
					id: "earliest",
					created_on: "2021-01-01T00:00:00Z",
					modified_on: "2021-01-01T00:00:00Z",
					workflow_id: "b",
					version_id: "c",
					status: "running",
				},
				{
					id: "latest",
					created_on: "2022-01-01T00:00:00Z",
					modified_on: "2022-01-01T00:00:00Z",
					workflow_id: "b",
					version_id: "c",
					status: "running",
				},
			];
			await mockGetInstances(mockInstances);
			await mockPauseRequest("latest");

			await runWrangler(`workflows instances pause some-workflow latest`);
			expect(std.out).toMatchInlineSnapshot(
				`"⏸️ The instance \\"latest\\" from some-workflow was paused successfully"`
			);
		});
	});
});
