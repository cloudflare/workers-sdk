import fs from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { createContainerDevPlan } from "../src/dev-options";
import type { ContainerApp, Exports } from "@cloudflare/workers-utils";

function schedulerContainer(props: Partial<ContainerApp>): ContainerApp {
	return { image: "./Dockerfile", ...props };
}

function getNamedImageTags(
	imageNames: string[],
	className = "ManagedDO"
): string[] {
	const plan = createContainerDevPlan({
		containers: [
			{
				name: "managed-container",
				class_name: className,
				scheduling_policy: "durable_object",
				images: Object.fromEntries(
					imageNames.map((imageName) => [
						imageName,
						{ dockerfile: "./Dockerfile" },
					])
				),
			},
		],
		exports: {},
		containerBuildId: "build-123",
	});
	return plan?.containerOptions.map(({ image_tag }) => image_tag) ?? [];
}

describe("createContainerDevPlan", () => {
	runInTempDir();

	test("returns undefined when no containers are configured", ({ expect }) => {
		expect(
			createContainerDevPlan({ containers: undefined, exports: {} })
		).toBeUndefined();
	});

	test("plans scheduler-backed images and skips unlinked entries", async ({
		expect,
	}) => {
		const dockerfile = path.resolve("Dockerfile");
		await fs.writeFile(dockerfile, "FROM scratch");
		const exports: Exports = {
			LinkedDO: {
				type: "durable-object",
				storage: "sqlite",
				container: "linked",
			},
		};

		const plan = createContainerDevPlan({
			containers: [
				schedulerContainer({
					class_name: "Browser",
					image: dockerfile,
					image_vars: { VERSION: "1" },
				}),
				schedulerContainer({
					name: "linked",
					image: "docker.io/example/linked:latest",
				}),
				schedulerContainer({
					name: "unlinked",
					image: "docker.io/example/unlinked:latest",
				}),
			],
			exports,
			containerBuildId: "build-123",
			configPath: path.resolve("wrangler.jsonc"),
		});

		expect(plan?.containerOptions).toEqual([
			{
				dockerfile,
				image_build_context: process.cwd(),
				image_vars: { VERSION: "1" },
				class_name: "Browser",
				image_tag: "cloudflare-dev/browser:build-123",
			},
			{
				image_uri: "docker.io/example/linked:latest",
				class_name: "LinkedDO",
				image_tag: "cloudflare-dev/linkeddo:build-123",
			},
		]);
		expect([...(plan?.containerRuntimeOptions.entries() ?? [])]).toEqual([
			["Browser", { imageName: "cloudflare-dev/browser:build-123" }],
			["LinkedDO", { imageName: "cloudflare-dev/linkeddo:build-123" }],
		]);
	});

	test("plans named images declared in a container's `images` map", ({
		expect,
	}) => {
		const configPath = path.resolve("config/wrangler.jsonc");
		const plan = createContainerDevPlan({
			containers: [
				{
					name: "managed-container",
					scheduling_policy: "durable_object",
					images: {
						worker: {
							dockerfile: "./images/worker.Dockerfile",
							build_context: "../context",
							build_vars: { VERSION: "1" },
						},
						tools: {
							image:
								"registry.cloudflare.com/account/tools@sha256:" +
								"a".repeat(64),
						},
						app: { dockerfile: "./images/app.Dockerfile" },
					},
				},
			],
			exports: {
				ManagedDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "managed-container",
				},
			},
			containerBuildId: "build-123",
			configPath,
		});
		const optionsByName = new Map(
			plan?.containerOptions.map((option) => [option.image_name, option])
		);
		const workerTag = optionsByName.get("worker")?.image_tag;
		const toolsTag = optionsByName.get("tools")?.image_tag;
		const appTag = optionsByName.get("app")?.image_tag;

		expect(plan?.containerOptions).toEqual([
			{
				dockerfile: path.resolve("config/images/worker.Dockerfile"),
				image_build_context: path.resolve("context"),
				image_vars: { VERSION: "1" },
				class_name: "ManagedDO",
				image_name: "worker",
				image_tag: workerTag,
			},
			{
				image_uri:
					"registry.cloudflare.com/account/tools@sha256:" + "a".repeat(64),
				class_name: "ManagedDO",
				image_name: "tools",
				image_tag: toolsTag,
			},
			{
				dockerfile: path.resolve("config/images/app.Dockerfile"),
				image_build_context: path.resolve("config/images"),
				image_vars: undefined,
				class_name: "ManagedDO",
				image_name: "app",
				image_tag: appTag,
			},
		]);
		expect(plan?.containerRuntimeOptions.get("ManagedDO")).toEqual({
			images: [
				{ name: "worker", image: workerTag },
				{ name: "tools", image: toolsTag },
				{ name: "app", image: appTag },
			],
		});
		expect(plan?.containerRuntimeOptions.get("ManagedDO")).not.toHaveProperty(
			"imageName"
		);
	});

	test("requires a build ID only when an image needs preparation", ({
		expect,
	}) => {
		const plan = createContainerDevPlan({
			containers: [
				{
					name: "managed-container",
					class_name: "ManagedDO",
					scheduling_policy: "durable_object",
				},
			],
			exports: {},
		});
		expect(plan?.containerOptions).toEqual([]);
		expect(plan?.containerRuntimeOptions.get("ManagedDO")).toEqual({});

		expect(() =>
			createContainerDevPlan({
				containers: [
					{
						name: "managed-container",
						class_name: "ManagedDO",
						scheduling_policy: "durable_object",
						images: { app: { dockerfile: "./Dockerfile" } },
					},
				],
				exports: {},
			})
		).toThrow(/Build ID should be set/);
	});

	test("creates bounded identity-preserving named-image tags", ({ expect }) => {
		for (const names of [
			["Foo", "foo"],
			["a/b", "a-b"],
			[".", "🤖"],
		]) {
			const tags = getNamedImageTags(names);
			expect(tags).toHaveLength(2);
			expect(new Set(tags).size).toBe(2);
			for (const tag of tags) {
				expect(tag).toMatch(
					/^cloudflare-dev\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{12}:build-123$/
				);
			}
		}

		const className = "C".repeat(256);
		const imageName = "i".repeat(128);
		const [tag] = getNamedImageTags([imageName], className);
		if (tag === undefined) {
			throw new Error("Expected a named-image tag");
		}
		expect(tag.slice(0, tag.lastIndexOf(":"))).toHaveLength(255);
		expect(getNamedImageTags([imageName], className)).toEqual([tag]);

		const collisionPlan = createContainerDevPlan({
			containers: [
				{
					name: "managed-container",
					class_name: "ManagedDO",
					scheduling_policy: "durable_object",
					images: { app: { dockerfile: "./Dockerfile" } },
				},
				schedulerContainer({
					class_name: "ManagedDO-app",
					image: "docker.io/example:latest",
				}),
			],
			exports: {},
			containerBuildId: "build-123",
		});
		const tags = collisionPlan?.containerOptions.map(
			({ image_tag }) => image_tag
		);
		expect(tags).toHaveLength(2);
		expect(new Set(tags).size).toBe(2);
	});
});
