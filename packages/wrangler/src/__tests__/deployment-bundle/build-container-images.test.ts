import path from "node:path";
import {
	buildAndMaybePush,
	cleanupBuiltImages,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import { beforeEach, describe, it, vi } from "vitest";
import { buildDurableObjectContainerImages } from "../../deployment-bundle/build-container-images";
import type { Config } from "@cloudflare/workers-utils";

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
				platform: "linux/amd64",
			},
			expect.any(String),
			false,
			undefined,
			false,
			undefined,
			{ displayName: "Sandbox/tools" }
		);
		expect(result).toEqual([
			{
				className: "Sandbox",
				imageName: "tools",
				localTag: expect.stringMatching(/^worker-sandbox-tools:wrangler-/),
			},
		]);
	});

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
			],
			expect.any(String)
		);
	});
});
