import { mkdirSync, writeFileSync } from "node:fs";
import {
	dockerBuild,
	dockerImageInspect,
	dockerLoginImageRegistry,
	getCloudflareContainerRegistry,
	runDockerCmd,
	runDockerCmdWithOutput,
} from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccountV4 as mockAccount } from "./utils";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		dockerLoginImageRegistry: vi.fn(),
		runDockerCmd: vi.fn(),
		runDockerCmdWithOutput: vi.fn(),
		dockerBuild: vi.fn(async () => ({
			abort: () => {},
			ready: Promise.resolve(),
		})),
		dockerImageInspect: vi.fn(),
	});
});

const dockerfile =
	'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "index.js"]';

describe("buildAndMaybePush", () => {
	runInTempDir();
	mockApiToken();
	mockAccountId();
	mockConsoleMethods();
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(dockerImageInspect)
			// return empty array of repo digests (i.e. image does not exist remotely)
			.mockResolvedValueOnce("[]")
			// return image size and number of layers
			.mockResolvedValueOnce("53387881 2")
			// return digest after pushing the namespaced image
			.mockResolvedValueOnce(
				'["registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
			);
		// we can set this to anything since there is nothing to match from docker image inspect
		vi.mocked(runDockerCmdWithOutput).mockReturnValueOnce(
			'{"Descriptor":{"digest":"wont-match-sha"}}'
		);
		mkdirSync("./container-context");

		writeFileSync("./container-context/Dockerfile", dockerfile);
		mockAccount();
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should be able to build image and push with test-app:tag", async ({
		expect,
	}) => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				// turn this into a relative path so that this works across different OSes
				"./container-context",
			],
			dockerfile,
		});

		// 2 calls: docker tag + docker push
		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
			"tag",
			`test-app:tag`,
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);

		expect(dockerImageInspect).toHaveBeenCalledTimes(3);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(1, "docker", {
			imageTag: `test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(2, "docker", {
			imageTag: `test-app:tag`,
			formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(3, "docker", {
			imageTag: `${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerLoginImageRegistry).toHaveBeenCalledOnce();
	});

	it("should be able to build image and push with registry.cloudflare.com/test-app:tag", async ({
		expect,
	}) => {
		await runWrangler(
			"containers build ./container-context -t registry.cloudflare.com/test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`registry.cloudflare.com/test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				// turn this into a relative path so that this works across different OSes
				"./container-context",
			],
			dockerfile,
		});

		// 2 calls: docker tag + docker push
		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
			"tag",
			`registry.cloudflare.com/test-app:tag`,
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(dockerImageInspect).toHaveBeenCalledTimes(3);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(1, "docker", {
			imageTag: `${getCloudflareContainerRegistry()}/test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(2, "docker", {
			imageTag: `${getCloudflareContainerRegistry()}/test-app:tag`,
			formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(3, "docker", {
			imageTag: `${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerLoginImageRegistry).toHaveBeenCalledOnce();
	});

	it("should be able to build image and push with registry.cloudflare.com/some-account-id/test-app:tag", async ({
		expect,
	}) => {
		await runWrangler(
			"containers build ./container-context -t registry.cloudflare.com/some-account-id/test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`registry.cloudflare.com/some-account-id/test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				// turn this into a relative path so that this works across different OSes
				"./container-context",
			],
			dockerfile,
		});

		// 2 calls: docker tag + docker push
		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
			"tag",
			`registry.cloudflare.com/some-account-id/test-app:tag`,
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(dockerImageInspect).toHaveBeenCalledTimes(3);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(1, "docker", {
			imageTag: `registry.cloudflare.com/some-account-id/test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(2, "docker", {
			imageTag: `registry.cloudflare.com/some-account-id/test-app:tag`,
			formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(3, "docker", {
			imageTag: `${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerLoginImageRegistry).toHaveBeenCalledOnce();
	});

	it("should use a custom docker path if provided", async ({ expect }) => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/custom/docker/path");
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("/custom/docker/path", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
		expect(dockerImageInspect).toHaveBeenCalledTimes(3);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(
			1,
			"/custom/docker/path",
			{
				imageTag: `test-app:tag`,
				formatString: "{{ json .RepoDigests }}",
			}
		);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(
			2,
			"/custom/docker/path",
			{
				imageTag: `test-app:tag`,
				formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
			}
		);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(
			3,
			"/custom/docker/path",
			{
				imageTag: `${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
				formatString: "{{ json .RepoDigests }}",
			}
		);
		expect(runDockerCmd).toHaveBeenCalledWith("/custom/docker/path", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(dockerLoginImageRegistry).toHaveBeenCalledWith(
			"/custom/docker/path",
			"registry.cloudflare.com"
		);
	});

	it("should be able to build image and push", async ({ expect }) => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				// turn this into a relative path so that this works across different OSes
				"./container-context",
			],
			dockerfile,
		});

		// 2 calls: docker tag + docker push
		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
			"tag",
			`test-app:tag`,
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(dockerImageInspect).toHaveBeenCalledTimes(3);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(1, "docker", {
			imageTag: `test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(2, "docker", {
			imageTag: `test-app:tag`,
			formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(3, "docker", {
			imageTag: `${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerLoginImageRegistry).toHaveBeenCalledOnce();
	});

	it("should be able to build image and not push if it already exists in remote if config sha and digest both match", async ({
		expect,
	}) => {
		vi.mocked(runDockerCmd).mockResolvedValueOnce({
			abort: () => {},
			ready: Promise.resolve({ aborted: false }),
		});
		vi.mocked(dockerImageInspect).mockReset();
		vi.mocked(dockerImageInspect)
			.mockResolvedValueOnce(
				'["registry.cloudflare.com/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
			)
			.mockResolvedValueOnce("53387881 2");
		vi.mocked(runDockerCmdWithOutput).mockReset();
		vi.mocked(runDockerCmdWithOutput).mockImplementationOnce(() => {
			return '{"Descriptor":{"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}';
		});

		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
		expect(runDockerCmdWithOutput).toHaveBeenCalledOnce();
		expect(runDockerCmdWithOutput).toHaveBeenCalledWith("docker", [
			"manifest",
			"inspect",
			"-v",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
		]);
		expect(dockerImageInspect).toHaveBeenCalledTimes(2);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(1, "docker", {
			imageTag: `test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
		expect(dockerImageInspect).toHaveBeenNthCalledWith(2, "docker", {
			imageTag: `test-app:tag`,
			formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
		});
		expect(runDockerCmd).toHaveBeenCalledOnce();
		expect(runDockerCmd).toHaveBeenCalledWith("docker", [
			"image",
			"rm",
			"test-app:tag",
		]);
		expect(dockerLoginImageRegistry).toHaveBeenCalledOnce();
	});

	it("should inspect the pushed image digest if the local digest is not remote", async ({
		expect,
	}) => {
		vi.mocked(dockerImageInspect).mockReset();
		vi.mocked(dockerImageInspect)
			.mockResolvedValueOnce(
				'["registry.cloudflare.com/test-app@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]'
			)
			.mockResolvedValueOnce("53387881 2")
			.mockResolvedValueOnce(
				'["registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
			);
		vi.mocked(runDockerCmdWithOutput).mockReset();
		vi.mocked(runDockerCmdWithOutput).mockImplementationOnce(() => {
			return '{"Descriptor":{"digest":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}}';
		});

		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);

		expect(runDockerCmdWithOutput).toHaveBeenCalledOnce();
		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
			"tag",
			`test-app:tag`,
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(dockerImageInspect).toHaveBeenCalledTimes(3);
		expect(dockerImageInspect).toHaveBeenNthCalledWith(3, "docker", {
			imageTag: `${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
			formatString: "{{ json .RepoDigests }}",
		});
	});

	it("should match digests for images with registry ports", async ({
		expect,
	}) => {
		vi.mocked(runDockerCmd).mockResolvedValueOnce({
			abort: () => {},
			ready: Promise.resolve({ aborted: false }),
		});
		vi.mocked(dockerImageInspect).mockReset();
		vi.mocked(dockerImageInspect)
			.mockResolvedValueOnce(
				'["localhost:5000/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
			)
			.mockResolvedValueOnce("53387881 2");
		vi.mocked(runDockerCmdWithOutput).mockReset();
		vi.mocked(runDockerCmdWithOutput).mockImplementationOnce(() => {
			return '{"Descriptor":{"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}';
		});

		await runWrangler(
			"containers build ./container-context -t localhost:5000/test-app:tag -p"
		);

		expect(runDockerCmdWithOutput).toHaveBeenCalledOnce();
		expect(runDockerCmdWithOutput).toHaveBeenCalledWith("docker", [
			"manifest",
			"inspect",
			"-v",
			"localhost:5000/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		]);
		expect(runDockerCmd).toHaveBeenCalledTimes(1);
		expect(runDockerCmd).toHaveBeenCalledWith("docker", [
			"image",
			"rm",
			"localhost:5000/test-app:tag",
		]);
		expect(dockerLoginImageRegistry).toHaveBeenCalledOnce();
	});

	it("should be able to build image and not push", async ({ expect }) => {
		await runWrangler("containers build ./container-context -t test-app");
		expect(dockerBuild).toHaveBeenCalledTimes(1);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`test-app`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
		expect(dockerImageInspect).not.toHaveBeenCalled();
		expect(dockerLoginImageRegistry).not.toHaveBeenCalled();
	});

	it("should fall back to manifest inspect if pushed image digests are unavailable", async ({
		expect,
	}) => {
		vi.mocked(dockerImageInspect).mockReset();
		vi.mocked(dockerImageInspect)
			.mockResolvedValueOnce("[]")
			.mockResolvedValueOnce("53387881 2")
			.mockResolvedValueOnce("[]");
		vi.mocked(runDockerCmdWithOutput).mockReset();
		vi.mocked(runDockerCmdWithOutput).mockImplementationOnce(() => {
			return '{"Descriptor":{"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}';
		});

		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);

		expect(dockerImageInspect).toHaveBeenCalledTimes(3);
		expect(runDockerCmdWithOutput).toHaveBeenCalledOnce();
		expect(runDockerCmdWithOutput).toHaveBeenCalledWith("docker", [
			"manifest",
			"inspect",
			"-v",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(dockerLoginImageRegistry).toHaveBeenCalledOnce();
	});

	it("should add --network=host flag if WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST is set", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST", "true");
		await runWrangler("containers build ./container-context -t test-app");
		expect(dockerBuild).toHaveBeenCalledTimes(1);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`test-app`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"--network",
				"host",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
	});

	it("should be able to build image with platform specified", async ({
		expect,
	}) => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p --platform linux/amd64"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"--load",
				"-t",
				`test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
	});

	it("should fail with an invalid platform", async ({ expect }) => {
		await expect(
			runWrangler(
				"containers build ./container-context -t test-app:tag -p --platform linux/arm64"
			)
		).rejects.toThrow("Unsupported platform");
	});

	it("should throw UserError when docker build fails", async ({ expect }) => {
		const errorMessage = "Docker build failed";
		vi.mocked(dockerBuild).mockResolvedValue({
			abort: () => {},
			ready: Promise.reject(new Error(errorMessage)),
		});
		await expect(
			runWrangler("containers build ./container-context -t test-app:tag")
		).rejects.toThrow(
			new UserError(errorMessage, {
				telemetryMessage: "cloudchamber build image operation failed",
			})
		);
	});

	it("should throw UserError when docker login fails", async ({ expect }) => {
		const errorMessage = "Docker login failed";
		vi.mocked(dockerBuild).mockRejectedValue(new Error(errorMessage));
		vi.mocked(dockerLoginImageRegistry).mockRejectedValue(
			new Error(errorMessage)
		);
		await expect(
			runWrangler("containers build ./container-context -t test-app:tag -p")
		).rejects.toThrow(
			new UserError(errorMessage, {
				telemetryMessage: "cloudchamber build image operation failed",
			})
		);
	});
});
