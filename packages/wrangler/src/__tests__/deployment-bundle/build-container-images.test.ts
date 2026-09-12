import path from "node:path";
import {
	cleanupBuiltImages,
	startContainerBuild,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import { beforeEach, describe, it, vi } from "vitest";
import { buildDurableObjectContainerImages } from "../../deployment-bundle/build-container-images";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	cleanupBuiltImages: vi.fn(),
	startContainerBuild: vi.fn().mockResolvedValue({
		abort: vi.fn(),
		ready: Promise.resolve(),
	}),
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
		expect(startContainerBuild).toHaveBeenCalledOnce();
		expect(startContainerBuild).toHaveBeenCalledWith({
			build: {
				tag: expect.stringMatching(/^worker-sandbox-tools:/),
				pathToDockerfile: expectedDockerfile,
				buildContext: path.dirname(expectedDockerfile),
				platform: "linux/amd64",
			},
			pathToDocker: expect.any(String),
			verifyDockerIsRunning: false,
		});
		expect(result).toEqual([
			{
				className: "Sandbox",
				imageName: "tools",
				localTag: expect.stringMatching(/^worker-sandbox-tools:/),
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
		expect(startContainerBuild).not.toHaveBeenCalled();
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
		expect(startContainerBuild).toHaveBeenCalledOnce();
	});

	it("cleans up earlier images when a later build fails", async ({
		expect,
	}) => {
		vi.mocked(startContainerBuild)
			.mockResolvedValueOnce({ abort: vi.fn(), ready: Promise.resolve() })
			.mockResolvedValueOnce({
				abort: vi.fn(),
				ready: Promise.reject(new Error("build failed")),
			});
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
					localTag: expect.stringMatching(/^worker-sandbox-first:/),
				},
			],
			expect.any(String)
		);
	});
});
