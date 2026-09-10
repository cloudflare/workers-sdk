import { setTimeout } from "node:timers/promises";
import {
	ApplicationsService,
	ContainerImagePreparationsService,
	ContainerImagePreparationStatus,
} from "@cloudflare/containers-shared";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { buildAndMaybePush } from "../../cloudchamber/build";
import { fillOpenAPIConfiguration } from "../../cloudchamber/common";
import {
	createDurableObjectNamespaceResolver,
	listDurableObjects,
} from "../../containers/deploy";
import {
	deployDurableObjectContainerApplications,
	prepareDurableObjectContainerApplications,
	resolveVersionedDurableObjectContainerApplications,
} from "../../containers/durable-object-applications";
import { getOrSelectAccountId } from "../../user";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));
vi.mock("../../containers/deploy");
vi.mock("../../user");
vi.mock("../../cloudchamber/build");
vi.mock("../../cloudchamber/common", () => ({
	fillOpenAPIConfiguration: vi.fn(),
	promiseSpinner: async (promise: Promise<unknown>) => promise,
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
const args = { dryRun: false, scriptName: "worker" };
const namespace = {
	id: "namespace",
	name: "sandbox",
	class: "Sandbox",
	script: "worker",
	use_sqlite: true,
};

beforeEach(() => {
	vi.mocked(getOrSelectAccountId).mockResolvedValue("account");
	vi.mocked(setTimeout).mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("Container image preparation", () => {
	it("uses the export class for Dockerfile tags and prepared image keys", async ({
		expect,
	}) => {
		vi.mocked(buildAndMaybePush).mockResolvedValue({ remoteDigest: image });
		vi.spyOn(
			ContainerImagePreparationsService,
			"prepareContainerImage"
		).mockResolvedValue({
			image,
			status: ContainerImagePreparationStatus.READY,
		});

		const result = await prepareDurableObjectContainerApplications(
			exportConfig,
			args
		);

		expect(result).toEqual({ Sandbox: { tools: image } });
		expect(buildAndMaybePush).toHaveBeenCalledOnce();
		expect(vi.mocked(buildAndMaybePush).mock.calls[0][0].tag).toMatch(
			/^worker-sandbox-tools:wrangler-/
		);
		expect(exportConfig.containers?.[0].class_name).toBeUndefined();
		expect(listDurableObjects).not.toHaveBeenCalled();
	});
	it("rejects a name-only export link to legacy storage before building images", async ({
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
				args
			)
		).rejects.toThrow("legacy KV storage backend");
		expect(buildAndMaybePush).not.toHaveBeenCalled();
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
			{
				...config,
				containers: [
					{
						...config.containers?.[0],
						images: { tools: { image }, alias: { image } },
					},
				],
			} as Config,
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
			prepareDurableObjectContainerApplications(config, args)
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
			prepareDurableObjectContainerApplications(config, args)
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
			prepareDurableObjectContainerApplications(config, args)
		).rejects.toThrow("connection reset");
		await expect(
			prepareDurableObjectContainerApplications(config, args)
		).resolves.toEqual({ Sandbox: { tools: image } });
		expect(prepare).toHaveBeenCalledTimes(2);
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
	it("rejects confirmed legacy storage even with no images to prepare", async ({
		expect,
	}) => {
		vi.mocked(listDurableObjects).mockResolvedValue([
			{ ...namespace, use_sqlite: false },
		]);
		await expect(
			prepareDurableObjectContainerApplications(unknownStorageConfig, args)
		).rejects.toThrow("legacy KV storage backend");
		expect(fillOpenAPIConfiguration).not.toHaveBeenCalled();
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
				prepareDurableObjectContainerApplications(unknownStorageConfig, args)
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
			prepareDurableObjectContainerApplications(unknownStorageConfig, {
				...args,
				dispatchNamespace: "target",
			})
		).resolves.toEqual({});
		vi.mocked(listDurableObjects).mockResolvedValue([
			{ ...namespace, dispatch_namespace: "target", use_sqlite: false },
		]);
		await expect(
			prepareDurableObjectContainerApplications(unknownStorageConfig, {
				...args,
				dispatchNamespace: "target",
			})
		).rejects.toThrow("legacy KV storage backend");
	});
	it("does not query namespaces for a dry run", async ({ expect }) => {
		await prepareDurableObjectContainerApplications(unknownStorageConfig, {
			...args,
			dryRun: true,
		});
		expect(listDurableObjects).not.toHaveBeenCalled();
	});
	it("propagates a namespace lookup failure", async ({ expect }) => {
		vi.mocked(listDurableObjects).mockRejectedValue(new Error("lookup failed"));
		await expect(
			prepareDurableObjectContainerApplications(unknownStorageConfig, args)
		).rejects.toThrow("lookup failed");
	});
});

describe("Container namespace resolution", () => {
	it("does not accept a preview when the production namespace is missing", async ({
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
	it("resolves every namespace before creating the first application", async ({
		expect,
	}) => {
		const create = vi.spyOn(ApplicationsService, "createApplication");
		vi.mocked(createDurableObjectNamespaceResolver).mockReturnValue(
			vi
				.fn()
				.mockResolvedValueOnce("namespace")
				.mockRejectedValueOnce(new Error("missing namespace"))
		);
		await expect(
			deployDurableObjectContainerApplications(
				{
					...config,
					containers: [
						...(config.containers ?? []),
						{
							name: "other",
							class_name: "Other",
							scheduling_policy: "durable_object",
						},
					],
				},
				{ versionId: "version", accountId: "account", scriptName: "worker" }
			)
		).rejects.toThrow("missing namespace");
		expect(create).not.toHaveBeenCalled();
	});
});
