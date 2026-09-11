import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getContainerConfigPath } from "@cloudflare/build-output-utils";
import {
	InputContainerSchema,
	OutputContainerSchema,
} from "@cloudflare/config";
import {
	buildOutputContainerConfigs,
	cleanupBuiltImages,
} from "@cloudflare/containers-shared";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { buildOutputContainers } from "../build-output-containers";
import type { ResolvedPluginConfig } from "../plugin-config";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@cloudflare/containers-shared")>();
	return {
		...actual,
		buildOutputContainerConfigs: vi.fn(),
		cleanupBuiltImages: vi.fn(),
	};
});

let root: string;

describe("buildOutputContainers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		root = fs.mkdtempSync(path.join(os.tmpdir(), "vite-build-containers-"));
	});

	afterEach(() => {
		fs.rmSync(root, { force: true, recursive: true });
		vi.unstubAllEnvs();
	});

	it("does nothing when experimental Build Output is disabled", async ({
		expect,
	}) => {
		await buildOutputContainers(createResolvedConfig(false), root);

		expect(buildOutputContainerConfigs).not.toHaveBeenCalled();
	});

	it("builds and writes Container output when enabled", async ({ expect }) => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");
		const inputConfig = InputContainerSchema.parse({
			type: "container",
			name: "api-container",
			image: { dockerfile: "./container/Dockerfile" },
		});
		const outputConfig = OutputContainerSchema.parse({
			...inputConfig,
			image: { localReference: "api-container:wrangler-test" },
		});
		vi.mocked(buildOutputContainerConfigs).mockResolvedValue({
			containers: [{ directoryName: "api", config: outputConfig }],
			builtImages: [{ localTag: "api-container:wrangler-test" }],
		});

		await buildOutputContainers(createResolvedConfig(true, inputConfig), root);

		expect(buildOutputContainerConfigs).toHaveBeenCalledWith({
			containers: [{ directoryName: "api", config: inputConfig }],
			root,
			pathToDocker: "/usr/bin/docker",
		});
		expect(
			JSON.parse(fs.readFileSync(getContainerConfigPath(root, "api"), "utf-8"))
		).toEqual(outputConfig);
	});

	it("cleans built tags when writing a Container config fails", async ({
		expect,
	}) => {
		const inputConfig = InputContainerSchema.parse({
			type: "container",
			name: "api-container",
			image: { dockerfile: "./container/Dockerfile" },
		});
		vi.mocked(buildOutputContainerConfigs).mockResolvedValue({
			containers: [
				{
					directoryName: "invalid/name",
					config: OutputContainerSchema.parse({
						...inputConfig,
						image: { localReference: "api-container:wrangler-test" },
					}),
				},
			],
			builtImages: [{ localTag: "api-container:wrangler-test" }],
		});

		await expect(
			buildOutputContainers(createResolvedConfig(true, inputConfig), root)
		).rejects.toThrow("Container directory names");
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[{ localTag: "api-container:wrangler-test" }],
			"docker"
		);
	});
});

function createResolvedConfig(
	cfBuildOutput: boolean,
	containerConfig = InputContainerSchema.parse({
		type: "container",
		name: "api-container",
		image: { reference: "registry.example.com/api:latest" },
	})
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
		parsedNewConfig: { api: containerConfig },
	} as unknown as ResolvedPluginConfig;
}
