import {
	CONTAINER_IMAGES_BINDING,
	getDurableObjectContainerApps,
} from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import { clearRemovedContainerImagesBindings } from "../src/deploy/helpers/container-image-bindings";
import { fetchResult } from "../src/shared/context";
vi.mock("../src/shared/context", () => ({ fetchResult: vi.fn() }));
import { addContainerImagesBinding } from "../src/deploy/helpers/container-image-bindings";
import type { ContainerlessConfig } from "../src/shared/types";
import type {
	Binding,
	DurableObjectContainerApp,
} from "@cloudflare/workers-utils";

describe("addContainerImagesBinding", () => {
	it("resolves named export links in the image binding, including empty image maps", ({
		expect,
	}) => {
		const durableObjectContainerConfig: DurableObjectContainerApp[] = [
			{
				name: "sandbox",
				scheduling_policy: "durable_object",
				images: {
					sandbox: { dockerfile: "./container/Dockerfile" },
				},
			},
			{
				name: "tools",
				scheduling_policy: "durable_object",
			},
		];
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			durableObjectContainerConfig,
			bindings,
			{
				Sandbox: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			},
			{
				exports: {
					Sandbox: {
						type: "durable-object",
						storage: "sqlite",
						container: "sandbox",
					},
					Tools: {
						type: "durable-object",
						storage: "sqlite",
						container: "tools",
					},
				},
			}
		);

		expect(Object.keys(bindings)).toEqual([CONTAINER_IMAGES_BINDING]);
		expect(bindings[CONTAINER_IMAGES_BINDING]).toEqual({
			type: "json",
			value: {
				Sandbox: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
				Tools: {},
			},
		});
		expect(durableObjectContainerConfig[1].class_name).toBeUndefined();
	});

	it("does not add the binding for scheduler-backed containers", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding([], bindings, {});

		expect(bindings).toEqual({});
	});

	it("does not add the binding from Durable Object export configuration", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding([], bindings, {
			Sandbox: {
				sandbox:
					"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			},
		});

		expect(bindings).toEqual({});
	});

	it.for([CONTAINER_IMAGES_BINDING])(
		"rejects a user binding with the reserved name %s",
		(bindingName, { expect }) => {
			const durableObjectContainerConfig = [
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
				},
			] as DurableObjectContainerApp[];
			const bindings: Record<string, Binding> = {
				[bindingName]: {
					type: "plain_text",
					value: "user value",
				},
			};

			expect(() =>
				addContainerImagesBinding(durableObjectContainerConfig, bindings, {})
			).toThrow(`The binding name "${bindingName}" is reserved`);
		}
	);

	it("rejects configured images that were not prepared", ({ expect }) => {
		const durableObjectContainerConfig = [
			{
				name: "sandbox",
				class_name: "Sandbox",
				scheduling_policy: "durable_object",
				images: {
					sandbox: { dockerfile: "./container/Dockerfile" },
				},
			},
		] as DurableObjectContainerApp[];

		expect(() =>
			addContainerImagesBinding(durableObjectContainerConfig, {}, {})
		).toThrow(
			'Container images for Durable Object class "Sandbox" were not prepared before upload.'
		);
	});

	it("inherits the existing image map without resolving local container changes", ({
		expect,
	}) => {
		const durableObjectContainerConfig = [
			{
				name: "sandbox",
				scheduling_policy: "durable_object",
				images: {
					sandbox: { dockerfile: "./container/Dockerfile" },
				},
			},
		] as DurableObjectContainerApp[];
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			durableObjectContainerConfig,
			bindings,
			{},
			{
				preserveExisting: true,
				workerExists: true,
				hasExistingBinding: true,
			}
		);

		expect(bindings).toEqual({
			[CONTAINER_IMAGES_BINDING]: { type: "inherit" },
		});
	});

	it("inherits an existing image binding without local managed containers", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			[],
			bindings,
			{},
			{
				preserveExisting: true,
				workerExists: true,
				hasExistingBinding: true,
			}
		);

		expect(bindings).toEqual({
			[CONTAINER_IMAGES_BINDING]: { type: "inherit" },
		});
	});

	it("rejects a local binding that conflicts with inherited Container images", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {
			[CONTAINER_IMAGES_BINDING]: { type: "json", value: { ordinary: true } },
		};
		expect(() =>
			addContainerImagesBinding(
				[],
				bindings,
				{},
				{
					preserveExisting: true,
					workerExists: true,
					hasExistingBinding: true,
				}
			)
		).toThrow("reserved for Durable Object-managed Container images");
	});

	it("omits the binding when preserving images for a new Worker", ({
		expect,
	}) => {
		const durableObjectContainerConfig = [
			{
				name: "sandbox",
				class_name: "Sandbox",
				scheduling_policy: "durable_object",
				images: {
					sandbox: { dockerfile: "./container/Dockerfile" },
				},
			},
		] as DurableObjectContainerApp[];
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			durableObjectContainerConfig,
			bindings,
			{},
			{
				preserveExisting: true,
				workerExists: false,
				hasExistingBinding: true,
			}
		);

		expect(bindings).toEqual({});
	});
});

describe("clearRemovedContainerImagesBindings", () => {
	const imageBinding = {
		name: CONTAINER_IMAGES_BINDING,
		type: "json",
		json: { Managed: {} },
	};
	it.for([
		undefined,
		[],
		[{ name: "scheduled", class_name: "Scheduled", image: "./Dockerfile" }],
	])(
		"neutralizes generated bindings after replacing managed containers with %j",
		async (containers, { expect }) => {
			vi.mocked(fetchResult).mockResolvedValue({ bindings: [imageBinding] });
			const bindings: Record<string, Binding> = {};
			await clearRemovedContainerImagesBindings(
				{} as ContainerlessConfig,
				getDurableObjectContainerApps(containers),
				bindings,
				"/worker"
			);
			expect(bindings).toEqual({
				[CONTAINER_IMAGES_BINDING]: { type: "json", value: {} },
			});
			expect(fetchResult).toHaveBeenCalledWith({}, "/worker/settings");
		}
	);
	it.for([undefined, []])(
		"preserves other remote user variables with containers %j",
		async (containers, { expect }) => {
			vi.mocked(fetchResult).mockResolvedValue({
				bindings: [{ name: "USER_IMAGES", type: "json", json: { user: true } }],
			});
			const bindings: Record<string, Binding> = {};
			await clearRemovedContainerImagesBindings(
				{} as ContainerlessConfig,
				getDurableObjectContainerApps(containers),
				bindings,
				"/worker"
			);
			expect(bindings).toEqual({});
		}
	);
	it.for([undefined, []])(
		"keeps other local variables while clearing Container images with containers %j",
		async (containers, { expect }) => {
			vi.mocked(fetchResult).mockResolvedValue({ bindings: [imageBinding] });
			const bindings: Record<string, Binding> = {
				USER_IMAGES: { type: "json", value: { user: true } },
			};
			await clearRemovedContainerImagesBindings(
				{} as ContainerlessConfig,
				getDurableObjectContainerApps(containers),
				bindings,
				"/worker"
			);
			expect(bindings).toEqual({
				USER_IMAGES: { type: "json", value: { user: true } },
				[CONTAINER_IMAGES_BINDING]: { type: "json", value: {} },
			});
		}
	);
	it.for([
		[
			{
				name: "managed",
				class_name: "Managed",
				scheduling_policy: "durable_object",
			},
		],
	])(
		"does not inspect or clear bindings for containers %j",
		async (containers, { expect }) => {
			const bindings: Record<string, Binding> = {};
			await clearRemovedContainerImagesBindings(
				{} as ContainerlessConfig,
				containers as DurableObjectContainerApp[],
				bindings,
				"/worker"
			);
			expect(bindings).toEqual({});
			expect(fetchResult).not.toHaveBeenCalled();
		}
	);
});
