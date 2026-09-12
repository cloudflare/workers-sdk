import fs from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { createContainerDevPlan } from "../src/dev-options";
import type { ContainerApp, Exports } from "@cloudflare/workers-utils";

function container(props: Partial<ContainerApp>): ContainerApp {
	return { image: "./Dockerfile", ...props };
}

function getContainerOptions(
	options: Parameters<typeof createContainerDevPlan>[0]
) {
	return createContainerDevPlan(options)?.containerOptions;
}

describe("createContainerDevPlan", () => {
	runInTempDir();

	test("returns undefined when no containers are configured", ({ expect }) => {
		expect(
			createContainerDevPlan({ containers: undefined, exports: {} })
		).toBeUndefined();
	});

	test("creates Dockerfile build options", async ({ expect }) => {
		const dockerfile = path.resolve("Dockerfile");
		await fs.writeFile(dockerfile, "FROM scratch");

		expect(
			getContainerOptions({
				containers: [
					container({
						class_name: "Browser",
						image: dockerfile,
						image_vars: { VERSION: "1" },
					}),
				],
				exports: {},
				containerBuildId: "build-123",
				configPath: path.resolve("wrangler.jsonc"),
			})
		).toEqual([
			{
				dockerfile,
				image_build_context: process.cwd(),
				image_vars: { VERSION: "1" },
				class_name: "Browser",
				image_tag: "cloudflare-dev/browser:build-123",
			},
		]);
	});

	test("creates registry pull options from export associations", ({
		expect,
	}) => {
		const exports: Exports = {
			Browser: {
				type: "durable-object",
				storage: "sqlite",
				container: "browser-container",
			},
		};

		expect(
			getContainerOptions({
				containers: [
					container({
						name: "browser-container",
						image: "docker.io/example/browser:latest",
					}),
				],
				exports,
				containerBuildId: "build-123",
			})
		).toEqual([
			{
				image_uri: "docker.io/example/browser:latest",
				class_name: "Browser",
				image_tag: "cloudflare-dev/browser:build-123",
			},
		]);
	});

	test("skips scheduler containers without a Durable Object class", ({
		expect,
	}) => {
		const plan = createContainerDevPlan({
			containers: [
				container({
					name: "linked",
					image: "docker.io/example/linked:latest",
				}),
				container({
					name: "unlinked",
					image: "docker.io/example/unlinked:latest",
				}),
			],
			exports: {
				LinkedDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "linked",
				},
			},
			containerBuildId: "build-123",
		});

		expect(plan?.containerOptions).toEqual([
			{
				image_uri: "docker.io/example/linked:latest",
				class_name: "LinkedDO",
				image_tag: "cloudflare-dev/linkeddo:build-123",
			},
		]);
		expect([...(plan?.containerRuntimeOptions.keys() ?? [])]).toEqual([
			"LinkedDO",
		]);
	});

	test("flattens Durable Object-managed images in mixed configurations", ({
		expect,
	}) => {
		const configPath = path.resolve("wrangler.jsonc");
		const options = getContainerOptions({
			containers: [
				{
					name: "managed-container",
					class_name: "ManagedDO",
					scheduling_policy: "durable_object",
					images: {
						tools: {
							image:
								"registry.cloudflare.com/account/tools@sha256:" +
								"a".repeat(64),
						},
						app: { dockerfile: "./containers/app.Dockerfile" },
					},
				},
				container({
					class_name: "Browser",
					image: "docker.io/example/browser:latest",
				}),
			],
			exports: {},
			containerBuildId: "build-123",
			configPath,
		});

		expect(options).toHaveLength(3);
		expect(options?.[0]).toMatchObject({
			dockerfile: path.resolve("containers/app.Dockerfile"),
			image_build_context: path.resolve("containers"),
			class_name: "ManagedDO",
			image_name: "app",
			image_tag: "cloudflare-dev/manageddo-app:build-123",
		});
		expect(options?.[1]).toMatchObject({
			image_uri:
				"registry.cloudflare.com/account/tools@sha256:" + "a".repeat(64),
			class_name: "ManagedDO",
			image_name: "tools",
			image_tag: "cloudflare-dev/manageddo-tools:build-123",
		});
		expect(options?.[2]).toEqual({
			image_uri: "docker.io/example/browser:latest",
			class_name: "Browser",
			image_tag: "cloudflare-dev/browser:build-123",
		});
	});

	test("creates class-scoped runtime image maps without a default", ({
		expect,
	}) => {
		const plan = createContainerDevPlan({
			containers: [
				{
					name: "first",
					class_name: "FirstDO",
					scheduling_policy: "durable_object",
					images: {
						worker: { dockerfile: "./worker.Dockerfile" },
						api: { dockerfile: "./api.Dockerfile" },
					},
				},
				{
					name: "second",
					class_name: "SecondDO",
					scheduling_policy: "durable_object",
				},
			],
			exports: {},
			containerBuildId: "build-123",
		});

		const firstOptions = plan?.containerOptions.filter(
			({ class_name }) => class_name === "FirstDO"
		);
		const apiTag = firstOptions?.find(
			({ image_name }) => image_name === "api"
		)?.image_tag;
		const workerTag = firstOptions?.find(
			({ image_name }) => image_name === "worker"
		)?.image_tag;
		expect(plan?.containerRuntimeOptions.get("FirstDO")).toEqual({
			images: [
				{ name: "api", image: apiTag },
				{ name: "worker", image: workerTag },
			],
		});
		expect(plan?.containerRuntimeOptions.get("SecondDO")).toEqual({});
	});

	test("preserves the legacy image as the runtime default", ({ expect }) => {
		const plan = createContainerDevPlan({
			containers: [
				container({
					class_name: "Browser",
					image: "docker.io/example/browser:latest",
				}),
			],
			exports: {},
			containerBuildId: "build-123",
		});

		expect(plan?.containerRuntimeOptions.get("Browser")).toEqual({
			imageName: "cloudflare-dev/browser:build-123",
		});
	});

	test("requires a build ID only when an image needs preparation", ({
		expect,
	}) => {
		const plan = createContainerDevPlan({
			containers: [
				{
					name: "omitted-images",
					class_name: "OmittedImagesDO",
					scheduling_policy: "durable_object",
				},
				{
					name: "empty-images",
					class_name: "EmptyImagesDO",
					scheduling_policy: "durable_object",
					images: {},
				},
			],
			exports: {},
		});
		expect(plan?.containerOptions).toEqual([]);
		expect(plan?.containerRuntimeOptions.get("OmittedImagesDO")).toEqual({});
		expect(plan?.containerRuntimeOptions.get("EmptyImagesDO")).toEqual({});

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

	test("rejects named images that resolve to the same local tag", ({
		expect,
	}) => {
		const cases: Array<{ className: string; imageNames: string[] }> = [
			{ className: "ManagedDO", imageNames: ["Foo", "foo"] },
			{ className: "ManagedDO", imageNames: ["a/b", "a-b"] },
		];
		for (const { className, imageNames } of cases) {
			const input = {
				containers: [
					{
						name: "managed-container",
						class_name: className,
						scheduling_policy: "durable_object" as const,
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
			};
			expect(() => getContainerOptions(input)).toThrow(
				/resolve to the same Docker tag/
			);
		}
	});

	test("creates Docker-safe bounded identity-preserving tags", ({ expect }) => {
		function createTag(imageName: string, className = "ManagedDO"): string {
			const options = getContainerOptions({
				containers: [
					{
						name: "managed-container",
						class_name: className,
						scheduling_policy: "durable_object",
						images: { [imageName]: { dockerfile: "./Dockerfile" } },
					},
				],
				exports: {},
				containerBuildId: "build-123",
			});
			return options?.[0]?.image_tag ?? "";
		}

		for (const imageName of [".", ".foo", "foo..bar", "🤖"]) {
			expect(createTag(imageName)).toMatch(
				/^cloudflare-dev\/[a-z0-9]+(?:-[a-z0-9]+)*:build-123$/
			);
		}
		const punctuationTags = [createTag("."), createTag("🤖")];
		expect(new Set(punctuationTags).size).toBe(2);
		for (const tag of punctuationTags) {
			expect(tag).not.toBe("cloudflare-dev/manageddo:build-123");
		}

		const className = "C".repeat(256);
		const imageName = "i".repeat(128);
		const tag = createTag(imageName, className);
		const repository = tag.slice(0, tag.lastIndexOf(":"));
		expect(repository.length).toBeLessThanOrEqual(255);
		expect(tag).toMatch(
			/^cloudflare-dev\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{12}:build-123$/
		);
		expect(createTag(imageName, className)).toBe(tag);

		const canonicalPrefix = "a".repeat(50);
		expect(createTag(`${canonicalPrefix}/x`, className)).not.toBe(
			createTag(`${canonicalPrefix}-x`, className)
		);
	});
});
