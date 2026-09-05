import {
	CONTAINER_IMAGES_BINDING,
	CONTAINER_IMAGES_METADATA_BINDING,
	CONTAINER_IMAGES_METADATA_VERSION,
} from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { addContainerImagesBinding } from "../src/deploy/helpers/container-image-bindings";
import type { Binding, Config } from "@cloudflare/workers-utils";

describe("addContainerImagesBinding", () => {
	it("adds only Durable Object-managed images to the JSON binding", ({
		expect,
	}) => {
		const config = {
			containers: [
				{
					name: "scheduled",
					class_name: "Scheduled",
					scheduling_policy: "default",
					image: "./Dockerfile",
				},
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: {
						sandbox: { dockerfile: "./container/Dockerfile" },
					},
				},
				{
					name: "tools",
					class_name: "Tools",
					scheduling_policy: "durable_object",
				},
			],
		} as unknown as Config;
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(config, bindings, {
			Sandbox: {
				sandbox:
					"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			},
		});

		expect(bindings[CONTAINER_IMAGES_METADATA_BINDING]).toEqual({
			type: "json",
			value: CONTAINER_IMAGES_METADATA_VERSION,
		});
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
	});

	it("does not add the binding for scheduler-backed containers", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			{
				containers: [
					{
						name: "scheduled",
						class_name: "Scheduled",
						scheduling_policy: "default",
						image: "./Dockerfile",
					},
				],
			} as unknown as Config,
			bindings,
			{}
		);

		expect(bindings).toEqual({});
	});

	it("does not add the binding from Durable Object export configuration", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			{
				exports: {
					Sandbox: {
						type: "durable-object",
						storage: "sqlite",
						container: {
							images: {
								sandbox: {
									dockerfile: "./container/Dockerfile",
								},
							},
						},
					},
				},
			} as unknown as Config,
			bindings,
			{
				Sandbox: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			}
		);

		expect(bindings).toEqual({});
	});

	it.for([CONTAINER_IMAGES_BINDING, CONTAINER_IMAGES_METADATA_BINDING])(
		"rejects a user binding with the reserved name %s",
		(bindingName, { expect }) => {
			const config = {
				containers: [
					{
						name: "sandbox",
						class_name: "Sandbox",
						scheduling_policy: "durable_object",
					},
				],
			} as unknown as Config;
			const bindings: Record<string, Binding> = {
				[bindingName]: {
					type: "plain_text",
					value: "user value",
				},
			};

			expect(() => addContainerImagesBinding(config, bindings, {})).toThrow(
				`The binding name "${bindingName}" is reserved`
			);
		}
	);

	it("rejects configured images that were not prepared", ({ expect }) => {
		const config = {
			containers: [
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: {
						sandbox: { dockerfile: "./container/Dockerfile" },
					},
				},
			],
		} as unknown as Config;

		expect(() => addContainerImagesBinding(config, {}, {})).toThrow(
			'Container images for Durable Object class "Sandbox" were not prepared before upload.'
		);
	});

	it("inherits the binding when the existing image map should be preserved", ({
		expect,
	}) => {
		const config = {
			containers: [
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: {
						sandbox: { dockerfile: "./container/Dockerfile" },
					},
				},
			],
		} as unknown as Config;
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			config,
			bindings,
			{},
			{
				preserveExisting: true,
				workerExists: true,
				hasExistingBinding: true,
				hasExistingMetadata: true,
			}
		);

		expect(bindings).toEqual({
			[CONTAINER_IMAGES_BINDING]: { type: "inherit" },
			[CONTAINER_IMAGES_METADATA_BINDING]: { type: "inherit" },
		});
	});

	it("inherits an existing image binding without local managed containers", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			{ containers: [] } as unknown as Config,
			bindings,
			{},
			{
				preserveExisting: true,
				workerExists: true,
				hasExistingBinding: true,
				hasExistingMetadata: true,
			}
		);

		expect(bindings).toEqual({
			[CONTAINER_IMAGES_BINDING]: { type: "inherit" },
			[CONTAINER_IMAGES_METADATA_BINDING]: { type: "inherit" },
		});
	});

	it("preserves an unmarked image binding without inventing a Container marker", ({
		expect,
	}) => {
		const bindings: Record<string, Binding> = {
			[CONTAINER_IMAGES_METADATA_BINDING]: {
				type: "json",
				value: { userData: true },
			},
		};
		addContainerImagesBinding(
			{} as Config,
			bindings,
			{},
			{
				preserveExisting: true,
				workerExists: true,
				hasExistingBinding: true,
				hasExistingMetadata: false,
			}
		);
		expect(bindings).toEqual({
			[CONTAINER_IMAGES_BINDING]: { type: "inherit" },
			[CONTAINER_IMAGES_METADATA_BINDING]: {
				type: "json",
				value: { userData: true },
			},
		});
	});

	it("omits the binding when preserving images for a new Worker", ({
		expect,
	}) => {
		const config = {
			containers: [
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: {
						sandbox: { dockerfile: "./container/Dockerfile" },
					},
				},
			],
		} as unknown as Config;
		const bindings: Record<string, Binding> = {};

		addContainerImagesBinding(
			config,
			bindings,
			{},
			{
				preserveExisting: true,
				workerExists: false,
				hasExistingBinding: true,
				hasExistingMetadata: true,
			}
		);

		expect(bindings).toEqual({});
	});
});
