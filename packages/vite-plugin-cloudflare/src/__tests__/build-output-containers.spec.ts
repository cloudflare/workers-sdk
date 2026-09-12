import { InputContainerSchema } from "@cloudflare/config";
import { buildAndWriteContainerOutput } from "@cloudflare/containers-shared";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { buildOutputContainers } from "../build-output-containers";
import type { ResolvedPluginConfig } from "../plugin-config";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@cloudflare/containers-shared")>();
	return {
		...actual,
		buildAndWriteContainerOutput: vi.fn(),
	};
});

describe("buildOutputContainers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("does nothing when experimental Build Output is disabled", async ({
		expect,
	}) => {
		await buildOutputContainers(createResolvedConfig(false), "/project");

		expect(buildAndWriteContainerOutput).not.toHaveBeenCalled();
	});

	it("builds and writes Container output when enabled", async ({ expect }) => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");
		const container = InputContainerSchema.parse({
			type: "container",
			name: "api-container",
			image: { dockerfile: "./container/Dockerfile" },
		});
		const config = { api: container };

		await buildOutputContainers(createResolvedConfig(true, config), "/project");

		expect(buildAndWriteContainerOutput).toHaveBeenCalledOnce();
		expect(buildAndWriteContainerOutput).toHaveBeenCalledWith({
			containers: config,
			root: "/project",
			pathToDocker: "/usr/bin/docker",
		});
	});

	it("propagates Container output failures", async ({ expect }) => {
		vi.mocked(buildAndWriteContainerOutput).mockRejectedValueOnce(
			new Error("build failed")
		);

		await expect(
			buildOutputContainers(createResolvedConfig(true), "/project")
		).rejects.toThrow("build failed");
	});
});

function createResolvedConfig(
	cfBuildOutput: boolean,
	parsedNewConfig = {
		api: InputContainerSchema.parse({
			type: "container",
			name: "api-container",
			image: { reference: "registry.example.com/api:latest" },
		}),
	}
): ResolvedPluginConfig {
	return {
		type: "workers",
		experimental: {
			headersAndRedirectsDevModeSupport: false,
			newConfig: {
				cfBuildOutput,
				types: { generate: true, includeRuntime: true },
			},
		},
		parsedNewConfig,
	} as unknown as ResolvedPluginConfig;
}
