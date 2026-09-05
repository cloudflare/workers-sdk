import {
	CONTAINER_IMAGES_BINDING,
	CONTAINER_IMAGES_METADATA_BINDING,
	CONTAINER_IMAGES_METADATA_VERSION,
} from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import {
	getContainerMetadata,
	getContainerMetadataForRolloutSkip,
} from "../src/deploy/helpers/container-metadata";
import { fetchVersions } from "../src/deploy/helpers/versions-api";
import type {
	ApiDeployment,
	ApiVersion,
} from "../src/deploy/helpers/versions-types";
import type { CfWorkerInit, Config } from "@cloudflare/workers-utils";

vi.mock("../src/deploy/helpers/versions-api");

describe("getContainerMetadata", () => {
	it("returns undefined when container configuration is absent", ({
		expect,
	}) => {
		expect(getContainerMetadata({} as Config)).toBeUndefined();
	});

	it("returns an empty list when container configuration is explicitly empty", ({
		expect,
	}) => {
		expect(
			getContainerMetadata({ containers: [] } as unknown as Config)
		).toEqual([]);
	});

	it("includes the resolved name when no Durable Object-managed images are configured", ({
		expect,
	}) => {
		const metadata = getContainerMetadata({
			containers: [
				{
					class_name: "Sandbox",
					name: "sandbox-app",
					scheduling_policy: "durable_object",
				},
			],
		} as unknown as Config);

		expect(metadata).toEqual([{ name: "sandbox-app", class_name: "Sandbox" }]);
	});

	it("includes prepared named images for Durable Object-managed containers", ({
		expect,
	}) => {
		const metadata = getContainerMetadata(
			{
				containers: [
					{
						class_name: "Sandbox",
						name: "sandbox-app",
						scheduling_policy: "durable_object",
						images: {
							sandbox: { dockerfile: "./container/Dockerfile" },
						},
					},
				],
			} as unknown as Config,
			{
				Sandbox: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			}
		);

		expect(metadata).toEqual([
			{
				name: "sandbox-app",
				class_name: "Sandbox",
				images: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			},
		]);
	});

	it("keeps Durable Object metadata without images when preparation is skipped", ({
		expect,
	}) => {
		const metadata = getContainerMetadata(
			{
				containers: [
					{
						class_name: "Sandbox",
						name: "sandbox-app",
						scheduling_policy: "durable_object",
						images: {
							sandbox: { dockerfile: "./container/Dockerfile" },
						},
					},
				],
			} as unknown as Config,
			{},
			{ allowUnprepared: true }
		);

		expect(metadata).toEqual([
			{
				name: "sandbox-app",
				class_name: "Sandbox",
			},
		]);
	});
});

describe("getContainerMetadataForRolloutSkip", () => {
	const deployedImages = {
		app: "registry.cloudflare.com/account/app@sha256:" + "a".repeat(64),
	};
	const deployedContainers = [
		{ name: "scheduled-app", class_name: "Scheduled" },
		{
			name: "managed-app",
			class_name: "Managed",
			images: deployedImages,
		},
	];
	function version(
		id: string,
		containers: CfWorkerInit["containers"],
		hasImages = false
	): ApiVersion {
		return {
			id,
			number: 1,
			metadata: {
				created_on: "",
				modified_on: "",
				source: "api",
				author_id: "",
				author_email: "",
			},
			resources: {
				bindings: hasImages
					? [
							{
								type: "json",
								name: CONTAINER_IMAGES_METADATA_BINDING,
								json: CONTAINER_IMAGES_METADATA_VERSION,
							},
							{
								type: "json",
								name: CONTAINER_IMAGES_BINDING,
								json: { Managed: deployedImages },
							},
						]
					: [],
				script: { etag: "", handlers: [], last_deployed_from: "api" },
				script_runtime: { usage_model: "standard", limits: {}, containers },
			},
		};
	}
	function recover(config: Config, versions: ApiVersion[]) {
		vi.mocked(fetchVersions).mockResolvedValue(versions);
		return getContainerMetadataForRolloutSkip(config, {
			accountId: "account",
			scriptName: "worker",
			dispatchNamespace: undefined,
			workerExists: true,
			latestDeployment: {
				id: "deployment",
				source: "api",
				strategy: "percentage",
				author_email: "",
				created_on: "",
				versions: versions.map(({ id }) => ({
					version_id: id,
					percentage: 100 / versions.length,
				})),
			},
		});
	}

	const emptyDeployment: ApiDeployment = {
		id: "deployment",
		source: "api",
		strategy: "percentage",
		author_email: "",
		created_on: "",
		versions: [],
	};

	it.for([undefined, emptyDeployment])(
		"rejects an existing Worker without recoverable deployed versions: %j",
		async (latestDeployment, { expect }) => {
			await expect(
				getContainerMetadataForRolloutSkip({} as Config, {
					accountId: "account",
					scriptName: "worker",
					dispatchNamespace: undefined,
					workerExists: true,
					latestDeployment,
				})
			).rejects.toThrow("deployed Container metadata could not be recovered");
			expect(fetchVersions).not.toHaveBeenCalled();
		}
	);

	it("rejects an existing Worker without an account ID", async ({ expect }) => {
		await expect(
			getContainerMetadataForRolloutSkip({} as Config, {
				accountId: undefined,
				scriptName: "worker",
				dispatchNamespace: undefined,
				workerExists: true,
				latestDeployment: undefined,
			})
		).rejects.toThrow("deployed Container metadata could not be recovered");
	});

	it.for([
		{ workerExists: false, dryRun: false, accountId: "account" },
		{ workerExists: true, dryRun: true, accountId: "account" },
		{ workerExists: true, dryRun: true, accountId: undefined },
	])(
		"keeps local metadata for first deployments and dry runs: %j",
		async (options, { expect }) => {
			const result = await getContainerMetadataForRolloutSkip(
				{
					containers: [
						{
							name: "sandbox",
							class_name: "Sandbox",
							scheduling_policy: "durable_object",
							images: { app: { dockerfile: "./Dockerfile" } },
						},
					],
				} as unknown as Config,
				{
					...options,
					scriptName: "worker",
					dispatchNamespace: undefined,
					latestDeployment: undefined,
				}
			);
			expect(result).toEqual({
				containers: [{ name: "sandbox", class_name: "Sandbox" }],
				hasExistingContainerImagesBinding: false,
				hasExistingContainerImagesMetadata: false,
			});
			expect(fetchVersions).not.toHaveBeenCalled();
		}
	);

	it.for([undefined, []])(
		"recovers exact deployed metadata and binding presence with local containers %j",
		async (containers, { expect }) => {
			const result = await recover({ containers } as unknown as Config, [
				version("one", deployedContainers, true),
			]);
			expect(result.containers).toBe(deployedContainers);
			expect(result.hasExistingContainerImagesBinding).toBe(true);
			expect(result.hasExistingContainerImagesMetadata).toBe(true);
		}
	);

	it.for([undefined, []])(
		"preserves deployed containers %j without adopting local additions or inheriting an absent binding",
		async (containers, { expect }) => {
			const result = await recover(
				{
					containers: [
						{
							class_name: "Added",
							name: "added-app",
							scheduling_policy: "durable_object",
							images: { app: { dockerfile: "./Dockerfile" } },
						},
					],
				} as unknown as Config,
				[version("one", containers)]
			);
			expect(result.containers).toBe(containers);
			expect(result.hasExistingContainerImagesBinding).toBe(false);
		}
	);

	it("rejects differing marker presence across active versions", async ({
		expect,
	}) => {
		const unmarked = version("two", deployedContainers, true);
		unmarked.resources.bindings = unmarked.resources.bindings.filter(
			(binding) => binding.name !== CONTAINER_IMAGES_METADATA_BINDING
		);
		await expect(
			recover({} as Config, [
				version("one", deployedContainers, true),
				unmarked,
			])
		).rejects.toThrow("matching Container images metadata markers");
	});

	it("rejects a marker without its image binding", async ({ expect }) => {
		const incomplete = version("one", deployedContainers, true);
		incomplete.resources.bindings = incomplete.resources.bindings.filter(
			(binding) => binding.name !== CONTAINER_IMAGES_BINDING
		);
		await expect(recover({} as Config, [incomplete])).rejects.toThrow(
			"matching Container images metadata markers"
		);
	});

	it("rejects inconsistent binding presence across active versions", async ({
		expect,
	}) => {
		await expect(
			recover({} as Config, [
				version("one", deployedContainers, true),
				version("two", deployedContainers),
			])
		).rejects.toThrow("binding presence");
	});

	it.for([undefined, [], [deployedContainers[0]]])(
		"rejects differing deployed metadata %j across active versions",
		async (containers, { expect }) => {
			await expect(
				recover({} as Config, [
					version("one", deployedContainers),
					version("two", containers),
				])
			).rejects.toThrow("identical Container metadata");
		}
	);
});
