import { writeFileSync } from "node:fs";
import path from "node:path";
import {
	buildContainerImages,
	SchedulingPolicy,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, test, vi } from "vitest";
import { preparePreviewContainers } from "../../preview/containers";
import type {
	BuiltContainerDeployment,
	ContainerNormalizedConfig,
	SharedContainerConfig,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("../../cloudchamber/common", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../cloudchamber/common")>()),
	fillOpenAPIConfiguration: vi.fn(),
}));
vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	buildContainerImages: vi.fn(),
	verifyDockerInstalled: vi.fn(),
}));

const PREVIEW_APP_NAME = "test-worker_my-feature_MyContainer";

function containerConfig(
	overrides: Partial<SharedContainerConfig> = {}
): ContainerNormalizedConfig {
	return {
		name: PREVIEW_APP_NAME,
		class_name: "MyContainer",
		max_instances: 0,
		scheduling_policy: SchedulingPolicy.DEFAULT,
		rollout_step_percentage: [90, 10],
		rollout_kind: "full_auto",
		rollout_active_grace_period: 0,
		constraints: {},
		instance_type: "dev",
		dockerfile: "/abs/path/Dockerfile",
		image_build_context: "/abs/path",
		...overrides,
	} as ContainerNormalizedConfig;
}

function builtDeploymentFor(
	container: ContainerNormalizedConfig
): BuiltContainerDeployment {
	return {
		container: container as BuiltContainerDeployment["container"],
		builtImage: {
			containerConfig:
				container as BuiltContainerDeployment["builtImage"]["containerConfig"],
			localTag: "preview:temp",
		},
	};
}

function previewConfig(container: {
	class_name?: string;
	image: string;
}): Config {
	return {
		...defaultWranglerConfig,
		name: "test-worker",
		configPath: path.resolve("wrangler.toml"),
		topLevelName: "test-worker",
		previews: {
			containers: [container],
			durable_objects: {
				bindings: [
					{
						name: "MY_CONTAINER",
						class_name: "MyContainer",
					},
				],
			},
		},
		durable_objects: {
			bindings: [],
		},
		migrations: [],
	} as unknown as Config;
}

describe("preparePreviewContainers", () => {
	runInTempDir();

	beforeEach(() => {
		vi.mocked(buildContainerImages).mockReset();
		vi.mocked(verifyDockerInstalled).mockReset();
		vi.mocked(buildContainerImages).mockResolvedValue([
			builtDeploymentFor(containerConfig()),
		]);
	});

	test("should preserve an uppercase preview slug in the application name", async ({
		expect,
	}) => {
		const dockerfile = path.resolve("Dockerfile");
		writeFileSync(dockerfile, "FROM scratch");

		await preparePreviewContainers(
			previewConfig({ class_name: "MyContainer", image: dockerfile }),
			"test-worker",
			"Feature-MyBranch",
			{ quiet: false }
		);

		expect(vi.mocked(buildContainerImages).mock.calls[0]?.[0][0]).toMatchObject(
			{
				name: "test-worker_Feature-MyBranch_MyContainer",
			}
		);
	});
});
