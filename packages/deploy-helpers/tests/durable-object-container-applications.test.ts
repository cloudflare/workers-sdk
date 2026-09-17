import { setTimeout } from "node:timers/promises";
import {
	ApplicationsService,
	ApiError,
	ContainerImagePreparationsService,
	ContainerImagePreparationStatus,
	createDurableObjectNamespaceResolver,
	listDurableObjects,
	pushImageIfChanged,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { getDurableObjectContainerApps } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	deployDurableObjectContainerApplications,
	deployVersionedDurableObjectContainerApplications,
	resolveVersionedDurableObjectContainerApplications,
	prepareDurableObjectContainerApplications,
} from "../src/deploy/helpers/durable-object-container-applications";
import type { BuiltDurableObjectContainerImage } from "../src/shared/types";
import type { Application } from "@cloudflare/containers-shared";
import type {
	Config,
	DurableObjectContainerApp,
} from "@cloudflare/workers-utils";

vi.mock("../src/shared/context", () => ({ logger: { log: vi.fn() } }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));
vi.mock("@cloudflare/cli-shared-helpers", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/cli-shared-helpers")>()),
	updateStatus: vi.fn(),
}));
vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	createDurableObjectNamespaceResolver: vi.fn(),
	listDurableObjects: vi.fn(),
	pushImageIfChanged: vi.fn(),
}));

const image = `registry.cloudflare.com/account/tools@sha256:${"a".repeat(64)}`;
const config = {
	migrations: [{ tag: "v1", new_sqlite_classes: ["Sandbox"] }],
	durable_objects: { bindings: [{ name: "SANDBOX", class_name: "Sandbox" }] },
	containers: [
		{
			name: "sandbox",
			class_name: "Sandbox",
			scheduling_policy: "durable_object",
			images: { tools: { image } },
		},
	],
} as unknown as Config;
const durableObjectContainerConfig = getDurableObjectContainerApps(
	config.containers
);
const exportConfig = {
	migrations: [],
	durable_objects: { bindings: [] },
	exports: {
		Sandbox: {
			type: "durable-object",
			storage: "sqlite",
			container: "sandbox",
		},
	},
	containers: [
		{
			name: "sandbox",
			scheduling_policy: "durable_object",
			images: { tools: { dockerfile: "./Dockerfile" } },
		},
	],
} as unknown as Config;
const args = { accountId: "account", dryRun: false, scriptName: "worker" };
const namespace = {
	id: "namespace",
	name: "sandbox",
	class: "Sandbox",
	script: "worker",
	use_sqlite: true,
};
const application = {
	id: "application",
	created_at: "2026-09-10T00:00:00Z",
	account_id: "account",
	name: "sandbox",
	version: 1,
	scheduling_policy: SchedulingPolicy.DURABLE_OBJECT,
	instances: 1,
	configuration: { image },
} satisfies Application;

function apiError(status: number) {
	return new ApiError(
		{ method: "GET", url: "/applications/namespace" },
		{
			url: "/applications/namespace",
			ok: false,
			status,
			statusText: "error",
			body: {},
		},
		"API request failed"
	);
}

beforeEach(() => {
	vi.mocked(setTimeout).mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("Durable Object application settings", () => {
	const deployArgs = {
		versionId: "version",
		accountId: "account",
		scriptName: "worker",
	};
	const existing = {
		id: "namespace",
		name: "sandbox",
		account_id: "account",
		created_at: "2026-09-09T00:00:00Z",
		version: 1,
		instances: 0,
		scheduling_policy: SchedulingPolicy.DURABLE_OBJECT,
		durable_objects: { namespace_id: "namespace" },
		configuration: { image, experimental_flags: ["old"] },
		observability: { logs: { enabled: true } },
	};
	const settingsConfig: Config = {
		...config,
		containers: [
			{
				name: "sandbox",
				class_name: "Sandbox",
				scheduling_policy: "durable_object",
				unsafe: { configuration: { experimental_flags: [] } },
				observability: { enabled: false },
			},
		],
	};
	const settings = {
		configuration: { experimental_flags: [] },
		observability: { logs: { enabled: false } },
	};
	const linkedSettingsConfigs = [
		{ link: "class_name", config: settingsConfig },
		{
			link: "name-only exports",
			config: {
				...exportConfig,
				containers: exportConfig.containers?.map((container) => ({
					...container,
					unsafe: { configuration: { experimental_flags: [] } },
					observability: { enabled: false },
				})),
			},
		},
	];
	const resolveNamespaceId = vi.fn<(className: string) => Promise<string>>();

	beforeEach(() => {
		resolveNamespaceId.mockReset().mockResolvedValue("namespace");
		vi.mocked(createDurableObjectNamespaceResolver).mockReturnValue(
			resolveNamespaceId
		);
		vi.spyOn(ApplicationsService, "getApplication").mockResolvedValue(existing);
		vi.spyOn(ApplicationsService, "createApplication").mockResolvedValue(
			existing
		);
		vi.spyOn(ApplicationsService, "modifyApplication").mockResolvedValue(
			existing
		);
	});

	it.for(linkedSettingsConfigs)(
		"initializes missing applications with only explicit settings through $link",
		async ({ config: linkedConfig }, { expect }) => {
			vi.mocked(ApplicationsService.getApplication).mockRejectedValue(
				apiError(404)
			);
			await deployDurableObjectContainerApplications(
				linkedConfig,
				getDurableObjectContainerApps(linkedConfig.containers),
				deployArgs
			);
			expect(resolveNamespaceId).toHaveBeenCalledWith("Sandbox");
			expect(ApplicationsService.createApplication).toHaveBeenCalledWith({
				name: "sandbox",
				scheduling_policy: "durable_object",
				durable_objects: { namespace_id: "namespace" },
				...settings,
			});
			expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
		}
	);

	it.for(linkedSettingsConfigs)(
		"replaces explicit settings including an empty flags list through $link",
		async ({ config: linkedConfig }, { expect }) => {
			await deployDurableObjectContainerApplications(
				linkedConfig,
				getDurableObjectContainerApps(linkedConfig.containers),
				deployArgs
			);
			expect(resolveNamespaceId).toHaveBeenCalledWith("Sandbox");
			expect(ApplicationsService.modifyApplication).toHaveBeenCalledWith(
				"namespace",
				settings
			);
			expect(ApplicationsService.createApplication).not.toHaveBeenCalled();
		}
	);

	it("preserves omitted settings and does not inherit root Worker observability", async ({
		expect,
	}) => {
		await deployDurableObjectContainerApplications(
			{ ...config, observability: { enabled: false } },
			durableObjectContainerConfig,
			deployArgs
		);
		expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
		vi.mocked(ApplicationsService.getApplication).mockRejectedValue(
			apiError(404)
		);
		await deployDurableObjectContainerApplications(
			{ ...config, observability: { enabled: true } },
			durableObjectContainerConfig,
			deployArgs
		);
		expect(ApplicationsService.createApplication).toHaveBeenCalledWith({
			name: "sandbox",
			scheduling_policy: "durable_object",
			durable_objects: { namespace_id: "namespace" },
		});
	});

	it("skips unchanged settings and only patches changed fields", async ({
		expect,
	}) => {
		vi.mocked(ApplicationsService.getApplication).mockResolvedValue({
			...existing,
			...settings,
			configuration: { image, ...settings.configuration },
		});
		await deployDurableObjectContainerApplications(
			settingsConfig,
			getDurableObjectContainerApps(settingsConfig.containers),
			deployArgs
		);
		expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
		vi.mocked(ApplicationsService.getApplication).mockResolvedValue({
			...existing,
			observability: settings.observability,
		});
		await deployDurableObjectContainerApplications(
			settingsConfig,
			getDurableObjectContainerApps(settingsConfig.containers),
			deployArgs
		);
		expect(ApplicationsService.modifyApplication).toHaveBeenCalledWith(
			"namespace",
			{ configuration: settings.configuration }
		);
	});

	it("keeps version uploads create-only", async ({ expect }) => {
		await deployDurableObjectContainerApplications(
			settingsConfig,
			getDurableObjectContainerApps(settingsConfig.containers),
			{
				...deployArgs,
				updateExisting: false,
			}
		);
		expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
		expect(ApplicationsService.createApplication).not.toHaveBeenCalled();
		vi.mocked(ApplicationsService.getApplication).mockRejectedValue(
			apiError(404)
		);
		await deployDurableObjectContainerApplications(
			settingsConfig,
			getDurableObjectContainerApps(settingsConfig.containers),
			{
				...deployArgs,
				updateExisting: false,
			}
		);
		expect(ApplicationsService.createApplication).toHaveBeenCalledWith(
			expect.objectContaining(settings)
		);
	});

	it.for([
		{ stored: undefined, flags: [] },
		{ stored: ["second", "first"], flags: ["first", "second", "first"] },
	])(
		"compares flags as sets without redundant updates: %j",
		async ({ stored, flags }, { expect }) => {
			vi.mocked(ApplicationsService.getApplication).mockResolvedValue({
				...existing,
				configuration: { image, experimental_flags: stored },
			});
			await deployDurableObjectContainerApplications(
				config,
				durableObjectContainerConfig.map((container) => ({
					...container,
					unsafe: { configuration: { experimental_flags: flags } },
				})),
				deployArgs
			);
			expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
		}
	);

	it("version deployments preserve application settings and ignore local config", async ({
		expect,
	}) => {
		const versionArgs = {
			applications: [
				{ name: "sandbox", class_name: "Sandbox", namespaceId: "namespace" },
			],
			accountId: "account",
			scriptName: "worker",
		};
		await deployVersionedDurableObjectContainerApplications(
			settingsConfig,
			versionArgs
		);
		expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
		vi.mocked(ApplicationsService.getApplication).mockRejectedValue(
			apiError(404)
		);
		await deployVersionedDurableObjectContainerApplications(
			settingsConfig,
			versionArgs
		);
		expect(ApplicationsService.createApplication).toHaveBeenCalledWith({
			name: "sandbox",
			scheduling_policy: "durable_object",
			durable_objects: { namespace_id: "namespace" },
		});
	});

	it.for([
		{ name: "different" },
		{ id: "different" },
		{ durable_objects: { namespace_id: "different" } },
		{ scheduling_policy: SchedulingPolicy.DEFAULT },
	])(
		"rejects mismatched identities before updating %j",
		async (changed, { expect }) => {
			vi.mocked(ApplicationsService.getApplication).mockResolvedValue({
				...existing,
				...changed,
			});
			await expect(
				deployDurableObjectContainerApplications(
					settingsConfig,
					getDurableObjectContainerApps(settingsConfig.containers),
					deployArgs
				)
			).rejects.toThrow("does not match Container");
			expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
			expect(ApplicationsService.createApplication).not.toHaveBeenCalled();
		}
	);

	it("does not mistake a failed lookup for a missing application", async ({
		expect,
	}) => {
		vi.mocked(ApplicationsService.getApplication).mockRejectedValue(
			apiError(403)
		);
		await expect(
			deployDurableObjectContainerApplications(
				settingsConfig,
				getDurableObjectContainerApps(settingsConfig.containers),
				deployArgs
			)
		).rejects.toThrow("API request failed");
		expect(ApplicationsService.createApplication).not.toHaveBeenCalled();
		expect(ApplicationsService.modifyApplication).not.toHaveBeenCalled();
	});
});

describe("Container image preparation", () => {
	it("uses the export class for prepared image keys", async ({ expect }) => {
		vi.mocked(pushImageIfChanged).mockResolvedValue({ remoteDigest: image });
		vi.spyOn(
			ContainerImagePreparationsService,
			"prepareContainerImage"
		).mockResolvedValue({
			image,
			status: ContainerImagePreparationStatus.READY,
		});

		const result = await prepareDurableObjectContainerApplications(
			exportConfig,
			getDurableObjectContainerApps(exportConfig.containers),
			[
				{
					className: "Sandbox",
					imageName: "tools",
					localTag: "worker-sandbox-tools:wrangler-test",
				},
			],
			args
		);

		expect(result).toEqual({ Sandbox: { tools: image } });
		expect(exportConfig.containers?.[0].class_name).toBeUndefined();
		expect(listDurableObjects).not.toHaveBeenCalled();
	});
	it("rejects a name-only export link to legacy storage before pushing images", async ({
		expect,
	}) => {
		await expect(
			prepareDurableObjectContainerApplications(
				{
					...exportConfig,
					exports: {
						Sandbox: {
							type: "durable-object",
							storage: "legacy-kv",
							container: "sandbox",
						},
					},
				},
				getDurableObjectContainerApps(exportConfig.containers),
				[
					{
						className: "Sandbox",
						imageName: "tools",
						localTag: "worker-sandbox-tools:wrangler-test",
					},
				],
				args
			)
		).rejects.toThrow("legacy KV storage backend");
		expect(pushImageIfChanged).not.toHaveBeenCalled();
	});
	it("polls pending images until ready and reuses their preparation", async ({
		expect,
	}) => {
		const prepare = vi
			.spyOn(ContainerImagePreparationsService, "prepareContainerImage")
			.mockResolvedValueOnce({
				image,
				status: ContainerImagePreparationStatus.PENDING,
			})
			.mockResolvedValueOnce({
				image,
				status: ContainerImagePreparationStatus.READY,
			});
		const result = await prepareDurableObjectContainerApplications(
			config,
			[
				{
					...durableObjectContainerConfig[0],
					images: { tools: { image }, alias: { image } },
				},
			],
			[],
			args
		);
		expect(result).toEqual({ Sandbox: { tools: image, alias: image } });
		expect(prepare).toHaveBeenCalledTimes(2);
		expect(prepare).toHaveBeenNthCalledWith(1, { image });
		expect(prepare).toHaveBeenNthCalledWith(2, { image });
		expect(setTimeout).toHaveBeenCalledOnce();
	});
	it("reports preparation errors and stops polling", async ({ expect }) => {
		const prepare = vi
			.spyOn(ContainerImagePreparationsService, "prepareContainerImage")
			.mockResolvedValue({
				image,
				status: ContainerImagePreparationStatus.ERROR,
				reason: "Image cannot be prepared",
			});
		await expect(
			prepareDurableObjectContainerApplications(
				config,
				durableObjectContainerConfig,
				[],
				args
			)
		).rejects.toThrow("Image cannot be prepared");
		expect(prepare).toHaveBeenCalledOnce();
		expect(setTimeout).not.toHaveBeenCalled();
	});
	it("times out pending preparation without returning an image map", async ({
		expect,
	}) => {
		const prepare = vi
			.spyOn(ContainerImagePreparationsService, "prepareContainerImage")
			.mockResolvedValue({
				image,
				status: ContainerImagePreparationStatus.PENDING,
			});
		vi.spyOn(Date, "now")
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(0)
			.mockReturnValue(15 * 60_000);
		await expect(
			prepareDurableObjectContainerApplications(
				config,
				durableObjectContainerConfig,
				[],
				args
			)
		).rejects.toThrow("Timed out while preparing the container image");
		expect(prepare).toHaveBeenCalledOnce();
	});
	it("propagates a transient request failure and allows a fresh retry", async ({
		expect,
	}) => {
		const prepare = vi
			.spyOn(ContainerImagePreparationsService, "prepareContainerImage")
			.mockRejectedValueOnce(new Error("connection reset"))
			.mockResolvedValueOnce({
				image,
				status: ContainerImagePreparationStatus.READY,
			});
		await expect(
			prepareDurableObjectContainerApplications(
				config,
				durableObjectContainerConfig,
				[],
				args
			)
		).rejects.toThrow("connection reset");
		await expect(
			prepareDurableObjectContainerApplications(
				config,
				durableObjectContainerConfig,
				[],
				args
			)
		).resolves.toEqual({ Sandbox: { tools: image } });
		expect(prepare).toHaveBeenCalledTimes(2);
	});
	it("pushes a prebuilt Dockerfile image before preparing it", async ({
		expect,
	}) => {
		vi.spyOn(
			ContainerImagePreparationsService,
			"prepareContainerImage"
		).mockResolvedValue({
			image,
			status: ContainerImagePreparationStatus.READY,
		});
		const push = vi.mocked(pushImageIfChanged).mockResolvedValue({
			remoteDigest: image,
		});
		const builtImage: BuiltDurableObjectContainerImage = {
			className: "Sandbox",
			imageName: "tools",
			localTag: "worker-sandbox-tools:wrangler-test",
		};
		const result = await prepareDurableObjectContainerApplications(
			config,
			[
				{
					...durableObjectContainerConfig[0],
					images: { tools: { dockerfile: "./Dockerfile" } },
				},
			],
			[builtImage],
			args
		);
		expect(result).toEqual({ Sandbox: { tools: image } });
		expect(push).toHaveBeenCalledWith({
			pathToDocker: expect.any(String),
			sourceTag: builtImage.localTag,
			targetTag: builtImage.localTag,
			accountId: "account",
			complianceConfig: config,
			cleanupSourceTag: true,
		});
		expect(builtImage.localTagCleaned).toBe(true);
	});
	it("pushes a shared local tag once and marks every image and class alias cleaned", async ({
		expect,
	}) => {
		const prepare = vi
			.spyOn(ContainerImagePreparationsService, "prepareContainerImage")
			.mockResolvedValue({
				image,
				status: ContainerImagePreparationStatus.READY,
			});
		const push = vi
			.mocked(pushImageIfChanged)
			.mockResolvedValue({ remoteDigest: image });
		const localTag = "worker-sandbox-tools:wrangler-test";
		const builtImages: BuiltDurableObjectContainerImage[] = [
			{ className: "Sandbox", imageName: "tools", localTag },
			{ className: "Sandbox", imageName: "alias", localTag },
			{ className: "Other", imageName: "tools", localTag },
		];
		const containers: DurableObjectContainerApp[] = [
			{
				name: "sandbox",
				class_name: "Sandbox",
				scheduling_policy: "durable_object",
				images: {
					tools: { dockerfile: "./Dockerfile" },
					alias: { dockerfile: "./nested/../Dockerfile" },
				},
			},
			{
				name: "other",
				class_name: "Other",
				scheduling_policy: "durable_object",
				images: { tools: { dockerfile: "./Dockerfile" } },
			},
		];

		const result = await prepareDurableObjectContainerApplications(
			{
				...config,
				migrations: [{ tag: "v1", new_sqlite_classes: ["Sandbox", "Other"] }],
			},
			containers,
			builtImages,
			args
		);

		expect(result).toEqual({
			Sandbox: { tools: image, alias: image },
			Other: { tools: image },
		});
		expect(push).toHaveBeenCalledOnce();
		expect(push).toHaveBeenCalledWith(
			expect.objectContaining({ sourceTag: localTag, cleanupSourceTag: true })
		);
		expect(prepare).toHaveBeenCalledOnce();
		expect(builtImages.map((builtImage) => builtImage.localTagCleaned)).toEqual(
			[true, true, true]
		);
	});
	it("pushes distinct local tags independently even when Dockerfile paths match", async ({
		expect,
	}) => {
		const otherImage = image.replace(/a{64}$/, "b".repeat(64));
		const prepare = vi
			.spyOn(ContainerImagePreparationsService, "prepareContainerImage")
			.mockResolvedValueOnce({
				image,
				status: ContainerImagePreparationStatus.READY,
			})
			.mockResolvedValueOnce({
				image: otherImage,
				status: ContainerImagePreparationStatus.READY,
			});
		const push = vi
			.mocked(pushImageIfChanged)
			.mockResolvedValueOnce({ remoteDigest: image })
			.mockResolvedValueOnce({ remoteDigest: otherImage });
		const builtImages: BuiltDurableObjectContainerImage[] = [
			{
				className: "Sandbox",
				imageName: "first",
				localTag: "worker-sandbox-first:wrangler-test",
			},
			{
				className: "Sandbox",
				imageName: "second",
				localTag: "worker-sandbox-second:wrangler-test",
			},
		];

		const result = await prepareDurableObjectContainerApplications(
			config,
			[
				{
					...durableObjectContainerConfig[0],
					images: {
						first: {
							dockerfile: "./Dockerfile",
							build_vars: { MODE: "first" },
						},
						second: {
							dockerfile: "./Dockerfile",
							build_vars: { MODE: "second" },
						},
					},
				},
			],
			builtImages,
			args
		);

		expect(result).toEqual({ Sandbox: { first: image, second: otherImage } });
		expect(push).toHaveBeenCalledTimes(2);
		expect(push).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ sourceTag: builtImages[0].localTag })
		);
		expect(push).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ sourceTag: builtImages[1].localTag })
		);
		expect(prepare).toHaveBeenNthCalledWith(1, { image });
		expect(prepare).toHaveBeenNthCalledWith(2, { image: otherImage });
		expect(builtImages.map((builtImage) => builtImage.localTagCleaned)).toEqual(
			[true, true]
		);
	});
	it("returns prebuilt local tags for a dry run without pushing or preparing", async ({
		expect,
	}) => {
		const prepare = vi.spyOn(
			ContainerImagePreparationsService,
			"prepareContainerImage"
		);
		const builtImage: BuiltDurableObjectContainerImage = {
			className: "Sandbox",
			imageName: "tools",
			localTag: "worker-sandbox-tools:wrangler-test",
		};

		const result = await prepareDurableObjectContainerApplications(
			exportConfig,
			getDurableObjectContainerApps(exportConfig.containers),
			[builtImage],
			{ ...args, accountId: undefined, dryRun: true }
		);

		expect(result).toEqual({ Sandbox: { tools: builtImage.localTag } });
		expect(pushImageIfChanged).not.toHaveBeenCalled();
		expect(prepare).not.toHaveBeenCalled();
		expect(builtImage.localTagCleaned).toBeUndefined();
	});
});

describe("unknown Durable Object storage", () => {
	const unknownStorageConfig = {
		...config,
		migrations: [],
		containers: [
			{
				name: "sandbox",
				class_name: "Sandbox",
				scheduling_policy: "durable_object",
			},
		],
	} as unknown as Config;
	const unknownStorageDurableObjectContainerConfig =
		getDurableObjectContainerApps(unknownStorageConfig.containers);
	it("rejects confirmed legacy storage even with no images to prepare", async ({
		expect,
	}) => {
		vi.mocked(listDurableObjects).mockResolvedValue([
			{ ...namespace, use_sqlite: false },
		]);
		await expect(
			prepareDurableObjectContainerApplications(
				unknownStorageConfig,
				unknownStorageDurableObjectContainerConfig,
				[],
				args
			)
		).rejects.toThrow("legacy KV storage backend");
	});
	it.for([
		[],
		[namespace],
		[{ ...namespace, script: "other", use_sqlite: false }],
		[{ ...namespace, dispatch_namespace: "other", use_sqlite: false }],
		[
			{
				...namespace,
				use_sqlite: false,
				preview: { id: "preview", slug: "preview", name: "preview" },
			},
			namespace,
		],
	])(
		"accepts storage unless a matching production namespace confirms legacy KV: %j",
		async (namespaces, { expect }) => {
			vi.mocked(listDurableObjects).mockResolvedValue(namespaces);
			await expect(
				prepareDurableObjectContainerApplications(
					unknownStorageConfig,
					unknownStorageDurableObjectContainerConfig,
					[],
					args
				)
			).resolves.toEqual({});
		}
	);
	it("validates only the target dispatch namespace", async ({ expect }) => {
		vi.mocked(listDurableObjects).mockResolvedValue([
			{ ...namespace, use_sqlite: false },
			{ ...namespace, dispatch_namespace: "other", use_sqlite: false },
			{ ...namespace, dispatch_namespace: "target" },
		]);
		await expect(
			prepareDurableObjectContainerApplications(
				unknownStorageConfig,
				unknownStorageDurableObjectContainerConfig,
				[],
				{
					...args,
					dispatchNamespace: "target",
				}
			)
		).resolves.toEqual({});
		vi.mocked(listDurableObjects).mockResolvedValue([
			{ ...namespace, dispatch_namespace: "target", use_sqlite: false },
		]);
		await expect(
			prepareDurableObjectContainerApplications(
				unknownStorageConfig,
				unknownStorageDurableObjectContainerConfig,
				[],
				{
					...args,
					dispatchNamespace: "target",
				}
			)
		).rejects.toThrow("legacy KV storage backend");
	});
	it("does not query namespaces for a dry run", async ({ expect }) => {
		await prepareDurableObjectContainerApplications(
			unknownStorageConfig,
			unknownStorageDurableObjectContainerConfig,
			[],
			{
				...args,
				accountId: undefined,
				dryRun: true,
			}
		);
		expect(listDurableObjects).not.toHaveBeenCalled();
	});
	it("propagates a namespace lookup failure", async ({ expect }) => {
		vi.mocked(listDurableObjects).mockRejectedValue(new Error("lookup failed"));
		await expect(
			prepareDurableObjectContainerApplications(
				unknownStorageConfig,
				unknownStorageDurableObjectContainerConfig,
				[],
				args
			)
		).rejects.toThrow("lookup failed");
	});
});

describe("Container namespace resolution", () => {
	it("does not accept a preview when a versioned production namespace is missing", async ({
		expect,
	}) => {
		vi.mocked(listDurableObjects).mockResolvedValue([
			{
				...namespace,
				preview: { id: "preview", slug: "preview", name: "preview" },
			},
		]);
		await expect(
			resolveVersionedDurableObjectContainerApplications(config, {
				applications: [{ name: "sandbox", class_name: "Sandbox" }],
				accountId: "account",
				scriptName: "worker",
			})
		).rejects.toThrow("has no namespace");
	});
	it("reuses an existing application on repeat deployments", async ({
		expect,
	}) => {
		vi.spyOn(ApplicationsService, "getApplication")
			.mockRejectedValueOnce(apiError(404))
			.mockResolvedValue({
				...application,
				id: "namespace",
				durable_objects: { namespace_id: "namespace" },
			});
		const create = vi
			.spyOn(ApplicationsService, "createApplication")
			.mockResolvedValue(application);
		vi.mocked(createDurableObjectNamespaceResolver).mockReturnValue(
			vi.fn().mockResolvedValue("namespace")
		);

		const deployArgs = {
			versionId: "version",
			accountId: "account",
			scriptName: "worker",
		};
		await deployDurableObjectContainerApplications(
			config,
			durableObjectContainerConfig,
			deployArgs
		);
		await deployDurableObjectContainerApplications(
			config,
			durableObjectContainerConfig,
			deployArgs
		);

		expect(create).toHaveBeenCalledOnce();
		expect(create).toHaveBeenNthCalledWith(1, {
			name: "sandbox",
			scheduling_policy: "durable_object",
			durable_objects: { namespace_id: "namespace" },
		});
	});
	it("resolves every namespace before creating the first application", async ({
		expect,
	}) => {
		const create = vi
			.spyOn(ApplicationsService, "createApplication")
			.mockResolvedValue(application);
		vi.mocked(createDurableObjectNamespaceResolver).mockReturnValue(
			vi
				.fn()
				.mockResolvedValueOnce("namespace")
				.mockRejectedValueOnce(new Error("missing namespace"))
		);
		await expect(
			deployDurableObjectContainerApplications(
				config,
				[
					...durableObjectContainerConfig,
					{
						name: "other",
						class_name: "Other",
						scheduling_policy: "durable_object",
					},
				],
				{ versionId: "version", accountId: "account", scriptName: "worker" }
			)
		).rejects.toThrow("missing namespace");
		expect(create).not.toHaveBeenCalled();
	});
});
