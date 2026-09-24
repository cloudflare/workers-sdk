import path from "node:path";
import {
	InputContainerSchema,
	OutputContainerSchema,
} from "@cloudflare/config";
import { describe, test } from "vitest";
import {
	createV2ContainerDevPlan,
	createV2ContainerPreviewPlan,
} from "../src/dev-options";

describe("createV2ContainerDevPlan", () => {
	test("plans standard and named Container images from input config", ({
		expect,
	}) => {
		const root = path.resolve("project");
		const standard = InputContainerSchema.parse({
			name: "standard",
			image: {
				dockerfile: "./containers/Dockerfile",
				buildContext: "./context",
				buildVars: { VERSION: "1" },
			},
		});
		const managed = InputContainerSchema.parse({
			name: "managed",
			schedulingPolicy: "durable-object",
			images: {
				api: { reference: "docker.io/example/api:latest" },
				worker: { dockerfile: "./worker.Dockerfile" },
			},
		});

		const plan = createV2ContainerDevPlan({
			containers: [standard, managed],
			exports: {
				StandardDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "standard",
				},
				ManagedDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "managed",
				},
			},
			root,
			containerBuildId: "build-123",
		});

		expect(plan?.containerOptions[0]).toEqual({
			class_name: "StandardDO",
			image_tag: "cloudflare-dev/standarddo:build-123",
			dockerfile: path.join(root, "containers/Dockerfile"),
			image_build_context: path.join(root, "context"),
			image_vars: { VERSION: "1" },
		});
		const namedOptions = plan?.containerOptions.slice(1) ?? [];
		expect(namedOptions).toHaveLength(2);
		expect(namedOptions[0]).toMatchObject({
			class_name: "ManagedDO",
			image_name: "api",
			image_uri: "docker.io/example/api:latest",
		});
		expect(namedOptions[1]).toMatchObject({
			class_name: "ManagedDO",
			image_name: "worker",
			dockerfile: path.join(root, "worker.Dockerfile"),
			image_build_context: root,
		});
		expect(plan?.containerRuntimeOptions.get("StandardDO")).toEqual({
			imageName: "cloudflare-dev/standarddo:build-123",
		});
		expect(plan?.containerRuntimeOptions.get("ManagedDO")).toEqual({
			images: namedOptions.map((option) => ({
				name: option.image_name,
				image: option.image_tag,
			})),
		});
	});

	test("does not require a build ID for an empty named-image Container", ({
		expect,
	}) => {
		const plan = createV2ContainerDevPlan({
			containers: [
				InputContainerSchema.parse({
					name: "managed",
					schedulingPolicy: "durable-object",
				}),
			],
			exports: {
				ManagedDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "managed",
				},
			},
			root: "/project",
		});

		expect(plan?.containerOptions).toEqual([]);
		expect(plan?.containerRuntimeOptions.get("ManagedDO")).toEqual({});
	});

	test("rejects missing and duplicate Container definitions", ({ expect }) => {
		expect(() =>
			createV2ContainerDevPlan({
				containers: [],
				exports: {
					ContainerDO: {
						type: "durable-object",
						storage: "sqlite",
						container: "missing",
					},
				},
				root: "/project",
			})
		).toThrow('Expected Container "missing"');

		const container = InputContainerSchema.parse({
			name: "duplicate",
			image: { reference: "docker.io/example:latest" },
		});
		expect(() =>
			createV2ContainerDevPlan({
				containers: [container, container],
				exports: {},
				root: "/project",
			})
		).toThrow('Duplicate Container name "duplicate"');
	});
});

describe("createV2ContainerPreviewPlan", () => {
	test("passes remote and local references directly to the runtime", ({
		expect,
	}) => {
		const plan = createV2ContainerPreviewPlan({
			containers: [
				OutputContainerSchema.parse({
					name: "standard",
					image: { localReference: "cloudflare-build/project/app:123" },
				}),
				OutputContainerSchema.parse({
					name: "managed",
					schedulingPolicy: "durable-object",
					images: {
						api: { reference: "registry.example.com/api@sha256:abc" },
						worker: { localReference: "cloudflare-build/project/worker:123" },
					},
				}),
			],
			exports: {
				StandardDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "standard",
				},
				ManagedDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "managed",
				},
			},
		});

		expect(plan?.containerRuntimeOptions).toEqual(
			new Map([
				["StandardDO", { imageName: "cloudflare-build/project/app:123" }],
				[
					"ManagedDO",
					{
						images: [
							{
								name: "api",
								image: "registry.example.com/api@sha256:abc",
							},
							{
								name: "worker",
								image: "cloudflare-build/project/worker:123",
							},
						],
					},
				],
			])
		);
		expect(plan?.containerOptions).toEqual([
			{
				class_name: "ManagedDO",
				image_name: "api",
				image_uri: "registry.example.com/api@sha256:abc",
				image_tag: "registry.example.com/api@sha256:abc",
			},
		]);
	});

	test("returns undefined when no Worker export references a Container", ({
		expect,
	}) => {
		expect(
			createV2ContainerPreviewPlan({
				containers: [],
				exports: {},
			})
		).toBeUndefined();
	});
});
