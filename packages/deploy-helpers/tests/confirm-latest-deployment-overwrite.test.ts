import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { describe, it, vi } from "vitest";
import { confirmLatestDeploymentOverwriteAndGetLatest } from "../src/deploy/helpers/confirm-latest-deployment-overwrite";
import {
	fetchDeploymentVersions,
	fetchLatestDeployment,
} from "../src/deploy/helpers/versions-api";
import { confirmLatestDeploymentOverwrite } from "../src/index";
import type { Config } from "@cloudflare/workers-utils/config";

vi.mock("../src/deploy/helpers/versions-api");
vi.mock("@cloudflare/cli-shared-helpers");
vi.mock("@cloudflare/cli-shared-helpers/interactive");

describe("confirmLatestDeploymentOverwrite public API", () => {
	it("returns the boolean true when there is no deployment", async ({
		expect,
	}) => {
		vi.mocked(fetchLatestDeployment).mockResolvedValue(undefined);
		expect(
			await confirmLatestDeploymentOverwrite(
				{} as Config,
				"account",
				"worker",
				"test-cli deploy",
				"test-cli versions deploy"
			)
		).toBe(true);
	});
	it.for([true, false])(
		"returns the boolean confirmation %j",
		async (confirmed, { expect }) => {
			vi.mocked(fetchLatestDeployment).mockResolvedValue({
				id: "deployment",
				source: "api",
				strategy: "percentage",
				author_email: "",
				created_on: "",
				versions: [
					{ version_id: "one", percentage: 50 },
					{ version_id: "two", percentage: 50 },
				],
			});
			vi.mocked(fetchDeploymentVersions).mockResolvedValue([[], new Map()]);
			vi.mocked(inputPrompt).mockResolvedValue(confirmed);
			expect(
				await confirmLatestDeploymentOverwrite(
					{} as Config,
					"account",
					"worker",
					"test-cli deploy",
					"test-cli versions deploy"
				)
			).toBe(confirmed);
		}
	);
});

describe("explicit traffic split replacement policy", () => {
	it.for([
		{ weights: [75, 25], approve: false, confirmed: false, asks: true },
		{ weights: [75, 25], approve: true, confirmed: true, asks: true },
		{ weights: [100, 0], approve: false, confirmed: true, asks: false },
	])(
		"handles weights $weights with approval $approve",
		async (scenario, { expect }) => {
			vi.clearAllMocks();
			const deployment = {
				id: "deployment",
				source: "api",
				strategy: "percentage" as const,
				author_email: "",
				created_on: "",
				versions: scenario.weights.map((percentage, index) => ({
					version_id: `version-${index}`,
					percentage,
				})),
			};
			vi.mocked(fetchLatestDeployment).mockResolvedValue(deployment);
			const confirm = vi.fn().mockResolvedValue(scenario.approve);

			const result = await confirmLatestDeploymentOverwriteAndGetLatest(
				{} as Config,
				"account",
				"worker",
				"cf deploy",
				"cf workers deployments create",
				confirm
			);

			expect(result).toEqual({
				confirmed: scenario.confirmed,
				latestDeployment: deployment,
			});
			if (scenario.asks) {
				expect(confirm).toHaveBeenCalledExactlyOnceWith(deployment.versions);
			} else {
				expect(confirm).not.toHaveBeenCalled();
			}
			expect(inputPrompt).not.toHaveBeenCalled();
			expect(fetchDeploymentVersions).not.toHaveBeenCalled();
		}
	);
});
