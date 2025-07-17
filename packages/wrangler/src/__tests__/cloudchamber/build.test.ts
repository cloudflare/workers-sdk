import { mkdirSync, writeFileSync } from "fs";
import {
	dockerBuild,
	dockerImageInspect,
	dockerLoginManagedRegistry,
	getCloudflareContainerRegistry,
	runDockerCmd,
} from "@cloudflare/containers-shared";
import { ensureDiskLimits } from "../../cloudchamber/build";
import { resolveAppDiskSize } from "../../cloudchamber/common";
import { type ContainerApp } from "../../config/environment";
import { UserError } from "../../errors";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccountV4 as mockAccount } from "./utils";
import type { CompleteAccountCustomer } from "@cloudflare/containers-shared";

const MiB = 1024 * 1024;
const defaultConfiguration: ContainerApp = {
	name: "abc",
	class_name: "",
	instances: 0,
	image: "",
};
vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		dockerLoginManagedRegistry: vi.fn(),
		runDockerCmd: vi.fn(),
		dockerBuild: vi.fn(() => ({ abort: () => {}, ready: Promise.resolve() })),
		dockerImageInspect: vi.fn(),
	});
});

const dockerfile =
	'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "index.js"]';

describe("buildAndMaybePush", () => {
	runInTempDir();
	mockApiToken();
	mockAccountId();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(dockerImageInspect).mockResolvedValue("53387881 2 []");
		mkdirSync("./container-context");

		writeFileSync("./container-context/Dockerfile", dockerfile);
		mockAccount();
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should use a custom docker path if provided", async () => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/custom/docker/path");
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("/custom/docker/path", {
			buildCmd: [
				"build",
				"-t",
				`${getCloudflareContainerRegistry()}/test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
		expect(dockerImageInspect).toHaveBeenCalledWith("/custom/docker/path", {
			imageTag: `${getCloudflareContainerRegistry()}/test-app:tag`,
			formatString:
				"{{ .Size }} {{ len .RootFS.Layers }} {{json .RepoDigests}}",
		});
		expect(runDockerCmd).toHaveBeenCalledWith("/custom/docker/path", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(dockerLoginManagedRegistry).toHaveBeenCalledWith(
			"/custom/docker/path"
		);
	});

	it("should be able to build image and push", async () => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"-t",
				`${getCloudflareContainerRegistry()}/test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});

		// 3 calls: docker tag + docker push + docker rm
		expect(runDockerCmd).toHaveBeenCalledTimes(3);
		expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
			"tag",
			`${getCloudflareContainerRegistry()}/test-app:tag`,
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(3, "docker", [
			"image",
			"rm",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expect(dockerImageInspect).toHaveBeenCalledOnce();
		expect(dockerImageInspect).toHaveBeenCalledWith("docker", {
			imageTag: `${getCloudflareContainerRegistry()}/test-app:tag`,
			formatString:
				"{{ .Size }} {{ len .RootFS.Layers }} {{json .RepoDigests}}",
		});
		expect(dockerLoginManagedRegistry).toHaveBeenCalledOnce();
	});

	it("should be able to build image and not push if it already exists in remote", async () => {
		vi.mocked(runDockerCmd).mockResolvedValueOnce({
			abort: () => {},
			ready: Promise.resolve({ aborted: false }),
		});
		vi.mocked(dockerImageInspect).mockResolvedValue(
			'53387881 2 ["registry.cloudflare.com/test-app@sha256:three"]'
		);
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"-t",
				`${getCloudflareContainerRegistry()}/test-app:tag`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(runDockerCmd).toHaveBeenNthCalledWith(
			1,
			"docker",
			[
				"manifest",
				"inspect",
				`${getCloudflareContainerRegistry()}/some-account-id/test-app@sha256:three`,
			],
			"ignore"
		);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"image",
			"rm",
			`${getCloudflareContainerRegistry()}/test-app:tag`,
		]);
		expect(dockerImageInspect).toHaveBeenCalledOnce();
		expect(dockerImageInspect).toHaveBeenCalledWith("docker", {
			imageTag: `${getCloudflareContainerRegistry()}/test-app:tag`,
			formatString:
				"{{ .Size }} {{ len .RootFS.Layers }} {{json .RepoDigests}}",
		});
		expect(dockerLoginManagedRegistry).toHaveBeenCalledOnce();
	});

	it("should be able to build image and not push", async () => {
		await runWrangler("containers build ./container-context -t test-app");
		expect(dockerBuild).toHaveBeenCalledTimes(1);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"-t",
				`${getCloudflareContainerRegistry()}/test-app`,
				"--platform",
				"linux/amd64",
				"--provenance=false",
				"-f",
				"-",
				"./container-context",
			],
			dockerfile,
		});
		expect(dockerImageInspect).toHaveBeenCalledOnce();
		expect(dockerLoginManagedRegistry).not.toHaveBeenCalled();
	});

	it("should add --network=host flag if WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST is set", async () => {
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST", "true");
		await runWrangler("containers build ./container-context -t test-app");
		expect(dockerBuild).toHaveBeenCalledTimes(1);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"-t",
				`${getCloudflareContainerRegistry()}/test-app`,
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

	it("should be able to build image with platform specified", async () => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p --platform linux/amd64"
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: [
				"build",
				"-t",
				`${getCloudflareContainerRegistry()}/test-app:tag`,
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

	it("should fail with an invalid platform", async () => {
		await expect(
			runWrangler(
				"containers build ./container-context -t test-app:tag -p --platform linux/arm64"
			)
		).rejects.toThrow("Unsupported platform");
	});

	it("should throw UserError when docker build fails", async () => {
		const errorMessage = "Docker build failed";
		vi.mocked(dockerBuild).mockReturnValue({
			abort: () => {},
			ready: Promise.reject(new Error(errorMessage)),
		});
		await expect(
			runWrangler("containers build ./container-context -t test-app:tag")
		).rejects.toThrow(new UserError(errorMessage));
	});

	it("should throw UserError when docker login fails", async () => {
		const errorMessage = "Docker login failed";
		vi.mocked(dockerBuild).mockRejectedValue(new Error(errorMessage));
		vi.mocked(dockerLoginManagedRegistry).mockRejectedValue(
			new Error(errorMessage)
		);
		await expect(
			runWrangler("containers build ./container-context -t test-app:tag -p")
		).rejects.toThrow(new UserError(errorMessage));
	});

	describe("ensureDiskLimits", () => {
		const accountBase = {
			limits: { disk_mb_per_deployment: 2000 },
		} as CompleteAccountCustomer;

		it("should throw error if app configured disk exceeds account limit", async () => {
			await expect(() =>
				ensureDiskLimits({
					requiredSize: 333 * MiB, // 333MiB
					account: accountBase,
					containerApp: {
						...defaultConfiguration,
						configuration: {
							image: "",
							disk: { size: "3GB" }, // This exceeds the account limit of 2GB
						},
					},
				})
			).rejects.toThrow("Exceeded account limits");
		});

		it("should throw error if image size exceeds allowed size", async () => {
			await expect(() =>
				ensureDiskLimits({
					requiredSize: 3000 * MiB, // 3GiB
					account: accountBase,
					containerApp: undefined,
				})
			).rejects.toThrow("Image too large");
		});

		it("should not throw when disk size is within limits", async () => {
			const result = await ensureDiskLimits({
				requiredSize: 256 * MiB, // 256MiB
				account: accountBase,
				containerApp: undefined,
			});

			expect(result).toEqual(undefined);
		});
	});

	describe("resolveAppDiskSize", () => {
		it("should return parsed app disk size", () => {
			const result = resolveAppDiskSize({
				...defaultConfiguration,
				configuration: { image: "", disk: { size: "500MB" } },
			});
			expect(result).toBeCloseTo(500 * 1000 * 1000, -5);
		});

		it("should return default size when disk size not set", () => {
			const result = resolveAppDiskSize({
				...defaultConfiguration,
				configuration: { image: "" },
			});
			expect(result).toBeCloseTo(2 * 1000 * 1000 * 1000, -5);
		});

		it("should return undefined if app is not passed", () => {
			expect(resolveAppDiskSize(undefined)).toBeUndefined();
		});
	});
});
