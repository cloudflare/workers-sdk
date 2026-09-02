import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { describe, it, vi } from "vitest";
import {
	fetchDeploymentVersions,
	fetchLatestDeployment,
} from "../src/deploy/helpers/versions-api";
import { confirmLatestDeploymentOverwrite } from "../src/index";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("../src/deploy/helpers/versions-api");
vi.mock("@cloudflare/cli-shared-helpers");
vi.mock("@cloudflare/cli-shared-helpers/interactive");

describe("confirmLatestDeploymentOverwrite public API", () => {
	it("returns the boolean true when there is no deployment", async ({
		expect,
	}) => {
		vi.mocked(fetchLatestDeployment).mockResolvedValue(undefined);
		expect(
			await confirmLatestDeploymentOverwrite({} as Config, "account", "worker")
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
					"worker"
				)
			).toBe(confirmed);
		}
	);
});
