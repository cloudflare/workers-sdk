import path from "node:path";
import {
	buildAndMaybePush,
	cleanupBuiltImages,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import { beforeEach, describe, it, vi } from "vitest";
import { buildDurableObjectContainerImages } from "../../deployment-bundle/build-container-images";
import type {
	Config,
	DurableObjectContainerImage,
} from "@cloudflare/workers-utils";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	buildAndMaybePush: vi.fn().mockResolvedValue({ newTag: "local" }),
	cleanupBuiltImages: vi.fn(),
	verifyDockerInstalled: vi.fn(),
}));

function containerConfig(source: Config["containers"]) {
	return {
		source,
		standard: { normalized: [], builtImages: [] },
		durableObjects: { builtImages: [] },
	};
}

describe("buildDurableObjectContainerImages", () => {
	const config = { configPath: "/project/wrangler.toml" } as Config;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(buildAndMaybePush)
			.mockReset()
			.mockResolvedValue({ newTag: "local" });
	});

	it("builds Dockerfile-backed Durable Object-managed container images without pushing", async ({
		expect,
	}) => {
		const props = {
			command: "deploy" as const,
			containersRollout: "gradual" as const,
			dryRun: false,
			name: "worker",
			containers: containerConfig([
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: {
						tools: { dockerfile: "./container/Dockerfile" },
						base: {
							image:
								"registry.cloudflare.com/account/base@sha256:" + "a".repeat(64),
						},
					},
				},
			]),
		};

		const result = await buildDurableObjectContainerImages(props, config);
		const expectedDockerfile = path.resolve(
			"/project",
			"./container/Dockerfile"
		);

		expect(verifyDockerInstalled).toHaveBeenCalledOnce();
		expect(buildAndMaybePush).toHaveBeenCalledOnce();
		expect(buildAndMaybePush).toHaveBeenCalledWith(
			{
				tag: expect.stringMatching(/^worker-sandbox-tools:wrangler-/),
				pathToDockerfile: expectedDockerfile,
				buildContext: path.dirname(expectedDockerfile),
				args: undefined,
				platform: "linux/amd64",
			},
			expect.any(String),
			false,
			undefined,
			false
		);
		expect(result).toEqual([
			{
				className: "Sandbox",
				imageName: "tools",
				localTag: expect.stringMatching(/^worker-sandbox-tools:wrangler-/),
			},
		]);
	});

	const exportConfig: Config = {
		...config,
		exports: {
			Sandbox: {
				type: "durable-object",
				storage: "sqlite",
				container: "sandbox",
			},
		},
	};

	function withBuildImages(
		images: Record<string, DurableObjectContainerImage>
	) {
		return {
			command: "versions upload" as const,
			dryRun: true,
			name: "worker",
			containers: containerConfig([
				{
					name: "sandbox",
					scheduling_policy: "durable_object",
					images,
				},
			]),
		};
	}

	it.for([
		{
			context: undefined,
			configPath: "project/wrangler.jsonc",
			expected: "project/docker",
		},
		{
			context: "../source",
			configPath: "project/wrangler.jsonc",
			expected: "source",
		},
		{
			context: path.resolve("absolute context"),
			configPath: "project/wrangler.jsonc",
			expected: "absolute context",
		},
		{ context: "./source", configPath: undefined, expected: "source" },
	])(
		"resolves name-only exports and per-image build options during dry run: %j",
		async ({ context, configPath, expected }, { expect }) => {
			const buildVars = {
				VERSION: "1.2.3",
				LABEL: "value with spaces=$",
				EMPTY: "",
			};
			const props = withBuildImages({
				tools: {
					dockerfile: "./docker/Dockerfile",
					build_context: context,
					build_vars: buildVars,
				},
			});
			const result = await buildDurableObjectContainerImages(props, {
				...exportConfig,
				configPath:
					configPath === undefined ? undefined : path.resolve(configPath),
			});

			expect(result).toEqual([
				{
					className: "Sandbox",
					imageName: "tools",
					localTag: expect.stringMatching(/^worker-sandbox-tools:wrangler-/),
				},
			]);
			expect(buildAndMaybePush).toHaveBeenCalledWith(
				expect.objectContaining({
					pathToDockerfile: path.resolve(
						configPath === undefined
							? "docker/Dockerfile"
							: "project/docker/Dockerfile"
					),
					buildContext: path.resolve(expected),
					args: buildVars,
					platform: "linux/amd64",
				}),
				expect.any(String),
				false,
				undefined,
				false
			);
			expect(props.containers.source?.[0].class_name).toBeUndefined();
		}
	);

	it.for([{ build_context: "../other" }, { build_vars: { MODE: "second" } }])(
		"builds the same Dockerfile separately when its options differ: %j",
		async (override, { expect }) => {
			const first = {
				dockerfile: "./Dockerfile",
				build_context: ".",
				build_vars: { MODE: "first" },
			};
			const result = await buildDurableObjectContainerImages(
				withBuildImages({ first, second: { ...first, ...override } }),
				exportConfig
			);

			expect(buildAndMaybePush).toHaveBeenCalledTimes(2);
			expect(result).toEqual([
				{
					className: "Sandbox",
					imageName: "first",
					localTag: expect.stringMatching(/^worker-sandbox-first:wrangler-/),
				},
				{
					className: "Sandbox",
					imageName: "second",
					localTag: expect.stringMatching(/^worker-sandbox-second:wrangler-/),
				},
			]);
		}
	);

	it.for<{
		first: Record<string, string> | undefined;
		second: Record<string, string>;
	}>([
		{ first: { FIRST: "1", SECOND: "2" }, second: { SECOND: "2", FIRST: "1" } },
		{ first: undefined, second: {} },
	])(
		"reuses equivalent builds regardless of normalized paths, defaults or variable order: %j",
		async ({ first, second }, { expect }) => {
			const result = await buildDurableObjectContainerImages(
				withBuildImages({
					first: { dockerfile: "./Dockerfile", build_vars: first },
					second: {
						dockerfile: "./nested/../Dockerfile",
						build_context: "./.",
						build_vars: second,
					},
				}),
				exportConfig
			);

			expect(buildAndMaybePush).toHaveBeenCalledOnce();
			expect(
				result.map(({ className, imageName }) => ({ className, imageName }))
			).toEqual([
				{ className: "Sandbox", imageName: "first" },
				{ className: "Sandbox", imageName: "second" },
			]);
			expect(result[0].localTag).toBe(result[1].localTag);
		}
	);

	it("skips deploy builds when container rollout is disabled", async ({
		expect,
	}) => {
		const props = {
			command: "deploy" as const,
			containersRollout: "none" as const,
			dryRun: false,
			name: "worker",
			containers: containerConfig([
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: { tools: { dockerfile: "./container/Dockerfile" } },
				},
			]),
		};

		await expect(
			buildDurableObjectContainerImages(props, config)
		).resolves.toEqual([]);
		expect(buildAndMaybePush).not.toHaveBeenCalled();
	});

	it("builds Durable Object-managed images before versions upload", async ({
		expect,
	}) => {
		const props = {
			command: "versions upload" as const,
			dryRun: false,
			name: "worker",
			containers: containerConfig([
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: { tools: { dockerfile: "./container/Dockerfile" } },
				},
			]),
		};

		const result = await buildDurableObjectContainerImages(props, config);

		expect(result).toHaveLength(1);
		expect(buildAndMaybePush).toHaveBeenCalledOnce();
	});

	it("cleans up earlier images when a later build fails", async ({
		expect,
	}) => {
		vi.mocked(buildAndMaybePush)
			.mockResolvedValueOnce({ newTag: "first" })
			.mockRejectedValueOnce(new Error("build failed"));
		const props = {
			command: "versions upload" as const,
			dryRun: false,
			name: "worker",
			containers: containerConfig([
				{
					name: "sandbox",
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					images: {
						first: { dockerfile: "./first/Dockerfile" },
						alias: { dockerfile: "./first/Dockerfile" },
						second: { dockerfile: "./second/Dockerfile" },
					},
				},
			]),
		};

		await expect(
			buildDurableObjectContainerImages(props, config)
		).rejects.toThrow("build failed");
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[
				{
					className: "Sandbox",
					imageName: "first",
					localTag: expect.stringMatching(/^worker-sandbox-first:wrangler-/),
				},
				{
					className: "Sandbox",
					imageName: "alias",
					localTag: expect.stringMatching(/^worker-sandbox-first:wrangler-/),
				},
			],
			expect.any(String)
		);
	});
});
