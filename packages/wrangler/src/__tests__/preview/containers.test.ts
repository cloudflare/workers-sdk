import { SchedulingPolicy } from "@cloudflare/containers-shared";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { beforeEach, describe, test, vi } from "vitest";
import { logger } from "../../logger";
import { deployPreviewContainers } from "../../preview/containers";
import { mockConsoleMethods } from "../helpers/mock-console";
import type {
	ContainerNormalizedConfig,
	SharedContainerConfig,
} from "@cloudflare/containers-shared";
import type { DeploymentResource } from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("../../cloudchamber/common", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../cloudchamber/common")>()),
	fillOpenAPIConfiguration: vi.fn(),
}));
vi.mock("../../containers/build", () => ({ buildContainer: vi.fn() }));
vi.mock("../../containers/deploy", () => ({
	apply: vi.fn(),
	listDurableObjects: vi.fn(),
}));

const { buildContainer } = await import("../../containers/build");
const { apply, listDurableObjects } = await import("../../containers/deploy");

const PREVIEW_APP_NAME = "test-worker_my-feature_MyContainer";
const ACCOUNT_ID = "some-account-id";

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

const deployment = {
	id: "deployment-id",
	env: {
		MY_CONTAINER: {
			type: "durable_object_namespace",
			class_name: "MyContainer",
			namespace_id: "preview-do-ns-id",
		},
	},
} as unknown as DeploymentResource;

describe("deployPreviewContainers", () => {
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.mocked(buildContainer).mockReset();
		vi.mocked(apply).mockReset();
		vi.mocked(listDurableObjects).mockReset();
		vi.mocked(listDurableObjects).mockResolvedValue([]);
		vi.mocked(buildContainer).mockResolvedValue({ newTag: "built:tag" });
	});

	// Docker rejects uppercase characters in an image repository name, but the
	// Cloudchamber application name must stay byte-identical to the name the
	// control plane generates, which embeds the PascalCase DO class name.
	test("should lowercase the image repository name while preserving the application name", async ({
		expect,
	}) => {
		const container = containerConfig();
		const config = {
			...defaultWranglerConfig,
			containers: [container],
		} as unknown as Config;

		await deployPreviewContainers(config, [container], deployment, ACCOUNT_ID, {
			quiet: false,
		});

		expect(vi.mocked(buildContainer).mock.calls[0]?.[0]).toMatchObject({
			name: "test-worker_my-feature_mycontainer",
		});
		expect(vi.mocked(apply).mock.calls[0]?.[1]).toMatchObject({
			name: PREVIEW_APP_NAME,
		});
	});

	test("should lowercase an uppercase preview slug in the image repository name", async ({
		expect,
	}) => {
		const container = containerConfig({
			name: "test-worker_Feature-MyBranch_MyContainer",
		});
		const config = {
			...defaultWranglerConfig,
			containers: [container],
		} as unknown as Config;

		await deployPreviewContainers(config, [container], deployment, ACCOUNT_ID, {
			quiet: false,
		});

		expect(vi.mocked(buildContainer).mock.calls[0]?.[0]).toMatchObject({
			name: "test-worker_feature-mybranch_mycontainer",
		});
	});

	// The image push target is derived from the compliance region, so an account
	// in a restricted region must not fall back to the public registry.
	test("should forward the compliance region to the image build", async ({
		expect,
	}) => {
		const container = containerConfig();
		const config = {
			...defaultWranglerConfig,
			compliance_region: "fedramp_high",
			containers: [container],
		} as unknown as Config;

		await deployPreviewContainers(config, [container], deployment, ACCOUNT_ID, {
			quiet: false,
		});

		expect(vi.mocked(buildContainer).mock.calls[0]?.[5]).toMatchObject({
			compliance_region: "fedramp_high",
		});
	});

	// A cross-script binding names a Durable Object owned by another Worker, so
	// its namespace must never be selected for this preview's container. The
	// class-name-keyed map would otherwise let it overwrite the local entry.
	test("should ignore a cross-script Durable Object binding that shares a class name", async ({
		expect,
	}) => {
		const container = containerConfig();
		const config = {
			...defaultWranglerConfig,
			containers: [container],
		} as unknown as Config;
		const deploymentWithCrossScriptBinding = {
			id: "deployment-id",
			env: {
				MY_CONTAINER: {
					type: "durable_object_namespace",
					class_name: "MyContainer",
					namespace_id: "preview-do-ns-id",
				},
				// Same class name, implemented by another Worker. Declared last so
				// an unfiltered map would end up holding this namespace_id.
				FOREIGN_CONTAINER: {
					type: "durable_object_namespace",
					class_name: "MyContainer",
					namespace_id: "other-worker-do-ns-id",
					script_name: "owner-worker",
				},
			},
		} as unknown as DeploymentResource;

		await deployPreviewContainers(
			config,
			[container],
			deploymentWithCrossScriptBinding,
			ACCOUNT_ID,
			{ quiet: false }
		);

		expect(vi.mocked(apply).mock.calls[0]?.[0]).toMatchObject({
			durable_object_namespace_id: "preview-do-ns-id",
		});
	});

	test("should not build an image for a container configured with an image URI", async ({
		expect,
	}) => {
		const container = {
			...containerConfig(),
			dockerfile: undefined,
			image_build_context: undefined,
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
		} as unknown as ContainerNormalizedConfig;
		delete (container as Record<string, unknown>).dockerfile;
		const config = {
			...defaultWranglerConfig,
			containers: [container],
		} as unknown as Config;

		await deployPreviewContainers(config, [container], deployment, ACCOUNT_ID, {
			quiet: false,
		});

		expect(buildContainer).not.toHaveBeenCalled();
		expect(vi.mocked(apply).mock.calls[0]?.[0]).toMatchObject({
			imageRef: {
				newTag: "registry.cloudflare.com/some-account-id/test:latest",
			},
		});
	});

	// `logger` drops a message above its level instead of redirecting it, so a
	// level of `error` discards warnings rather than leaving them on stderr.
	test("should keep warnings on stderr while suppressing stdout", async ({
		expect,
	}) => {
		const container = containerConfig();
		const config = {
			...defaultWranglerConfig,
			containers: [container],
		} as unknown as Config;
		vi.mocked(apply).mockImplementation(async () => {
			logger.warn("a container warning");
		});

		await deployPreviewContainers(config, [container], deployment, ACCOUNT_ID, {
			quiet: true,
		});

		expect(std.warn).toContain("a container warning");
		expect(std.out).toBe("");
	});
});
