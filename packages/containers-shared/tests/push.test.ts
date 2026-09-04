import { beforeEach, describe, it, vi } from "vitest";
import { constructBuildCommand, dockerBuild } from "../src/build";
import { initContainersSharedContext } from "../src/context";
import { dockerImageInspect } from "../src/inspect";
import { dockerLoginImageRegistry } from "../src/login";
import {
	buildAndMaybePushContainerImage,
	buildContainerImage,
	clearCachedContainerAccountDetails,
	pushContainerImage,
} from "../src/push";
import { runDockerCmd, runDockerCmdWithOutput } from "../src/utils";
import type { FetchResultFetcher } from "@cloudflare/workers-utils";

vi.mock("../src/build", () => ({
	constructBuildCommand: vi.fn(async () => ({
		buildCmd: ["build", "-t", "test-app:tag"],
		dockerfile: "FROM scratch",
	})),
	dockerBuild: vi.fn(async () => ({
		abort: vi.fn(),
		ready: Promise.resolve(),
	})),
}));

vi.mock("../src/inspect", () => ({
	dockerImageInspect: vi.fn(),
}));

vi.mock("../src/login", () => ({
	dockerLoginImageRegistry: vi.fn(),
}));

vi.mock("../src/utils", () => ({
	runDockerCmd: vi.fn(async () => ({
		abort: vi.fn(),
		ready: Promise.resolve({ aborted: false }),
	})),
	runDockerCmdWithOutput: vi.fn(),
}));

describe("container image build and push helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearCachedContainerAccountDetails();
	});

	it("builds an image without making Cloudflare API calls", async ({
		expect,
	}) => {
		const fetchResult = vi.fn();
		initContainersSharedContext({
			accountId: "abc123",
			apiFamily: "containers",
			fetchResult: fetchResult as FetchResultFetcher,
		});

		await expect(
			buildContainerImage({
				args: {
					tag: "test-app:tag",
					pathToDockerfile: "./Dockerfile",
					buildContext: ".",
				},
				pathToDocker: "docker",
			})
		).resolves.toEqual({ newTag: "test-app:tag" });

		expect(fetchResult).not.toHaveBeenCalled();
		expect(constructBuildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				tag: "test-app:tag",
				pathToDockerfile: "./Dockerfile",
				buildContext: ".",
			}),
			undefined
		);
		expect(dockerBuild).toHaveBeenCalledWith("docker", {
			buildCmd: ["build", "-t", "test-app:tag"],
			dockerfile: "FROM scratch",
			verifyDockerIsRunning: undefined,
		});
	});

	it("uses the containers API family when loading account details for push", async ({
		expect,
	}) => {
		const fetchResult = vi.fn(async () => ({
			external_account_id: "abc123",
			limits: {
				vcpu_per_deployment: 1,
				memory_mib_per_deployment: 1024,
				disk_mb_per_deployment: 2000,
			},
		}));
		initContainersSharedContext({
			accountId: "abc123",
			apiFamily: "containers",
			fetchResult: fetchResult as FetchResultFetcher,
		});
		vi.mocked(dockerImageInspect)
			.mockResolvedValueOnce("100 1")
			.mockResolvedValueOnce(
				'["registry.cloudflare.com/abc123/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
			);
		vi.mocked(runDockerCmdWithOutput).mockReturnValue(
			'{"Descriptor":{"digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}'
		);

		await pushContainerImage({
			imageTag: "test-app:tag",
			pathToDocker: "docker",
			complianceConfig: { compliance_region: "public" },
		});

		expect(fetchResult).toHaveBeenCalledWith(
			{ compliance_region: "public" },
			"/accounts/abc123/containers/me"
		);
		expect(dockerLoginImageRegistry).toHaveBeenCalledWith(
			"docker",
			"registry.cloudflare.com",
			{ compliance_region: "public" }
		);
		expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
			"tag",
			"test-app:tag",
			"registry.cloudflare.com/abc123/test-app:tag",
		]);
		expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
			"push",
			"registry.cloudflare.com/abc123/test-app:tag",
		]);
	});

	for (const [inputTag, expectedTag] of [
		["test-app:tag", "registry.cloudflare.com/abc123/test-app:tag"],
		[
			"test-namespace/app:tag",
			"registry.cloudflare.com/abc123/test-namespace/app:tag",
		],
		[
			"registry.cloudflare.com/test-app:tag",
			"registry.cloudflare.com/abc123/test-app:tag",
		],
		[
			"registry.cloudflare.com/abc123/test-app:tag",
			"registry.cloudflare.com/abc123/test-app:tag",
		],
	]) {
		it(`pushes ${inputTag} as ${expectedTag}`, async ({ expect }) => {
			const fetchResult = vi.fn(async () => ({
				external_account_id: "abc123",
				limits: {
					vcpu_per_deployment: 1,
					memory_mib_per_deployment: 1024,
					disk_mb_per_deployment: 2000,
				},
			}));
			initContainersSharedContext({
				accountId: "abc123",
				apiFamily: "containers",
				fetchResult: fetchResult as FetchResultFetcher,
			});
			vi.mocked(dockerImageInspect)
				.mockResolvedValueOnce("100 1")
				.mockResolvedValueOnce(
					`["${expectedTag.replace(/:tag$/, "")}@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]`
				);
			vi.mocked(runDockerCmdWithOutput).mockReturnValue(
				'{"Descriptor":{"digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}'
			);

			await pushContainerImage({
				imageTag: inputTag,
				pathToDocker: "docker",
				complianceConfig: { compliance_region: "public" },
			});

			expect(runDockerCmd).toHaveBeenNthCalledWith(1, "docker", [
				"tag",
				inputTag,
				expectedTag,
			]);
			expect(runDockerCmd).toHaveBeenNthCalledWith(2, "docker", [
				"push",
				expectedTag,
			]);
		});
	}

	it("uses the cloudchamber API family when configured", async ({ expect }) => {
		const fetchResult = vi.fn(async () => ({
			external_account_id: "abc123",
			limits: {
				vcpu_per_deployment: 1,
				memory_mib_per_deployment: 1024,
				disk_mb_per_deployment: 2000,
			},
		}));
		initContainersSharedContext({
			accountId: "abc123",
			apiFamily: "cloudchamber",
			fetchResult: fetchResult as FetchResultFetcher,
		});
		vi.mocked(dockerImageInspect)
			.mockResolvedValueOnce("100 1")
			.mockResolvedValueOnce(
				'["registry.cloudflare.com/abc123/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
			);
		vi.mocked(runDockerCmdWithOutput).mockReturnValue(
			'{"Descriptor":{"digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}'
		);

		await pushContainerImage({
			imageTag: "test-app:tag",
			pathToDocker: "docker",
			complianceConfig: { compliance_region: "public" },
		});

		expect(fetchResult).toHaveBeenCalledWith(
			{ compliance_region: "public" },
			"/accounts/abc123/cloudchamber/me"
		);
	});

	it("can skip pushing a built image that already exists remotely", async ({
		expect,
	}) => {
		const fetchResult = vi.fn(async () => ({
			external_account_id: "abc123",
			limits: {
				vcpu_per_deployment: 1,
				memory_mib_per_deployment: 1024,
				disk_mb_per_deployment: 2000,
			},
		}));
		initContainersSharedContext({
			accountId: "abc123",
			apiFamily: "containers",
			fetchResult: fetchResult as FetchResultFetcher,
		});
		vi.mocked(dockerImageInspect)
			.mockResolvedValueOnce("100 1")
			.mockResolvedValueOnce(
				'["registry.cloudflare.com/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
			);
		vi.mocked(runDockerCmdWithOutput).mockReturnValueOnce(
			'{"Descriptor":{"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}'
		);

		await expect(
			buildAndMaybePushContainerImage({
				args: {
					tag: "test-app:tag",
					pathToDockerfile: "./Dockerfile",
					buildContext: ".",
				},
				pathToDocker: "docker",
				push: true,
			})
		).resolves.toEqual({
			remoteDigest:
				"registry.cloudflare.com/abc123/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});

		expect(runDockerCmdWithOutput).toHaveBeenCalledWith("docker", [
			"manifest",
			"inspect",
			"-v",
			"registry.cloudflare.com/abc123/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		]);
		expect(runDockerCmd).toHaveBeenCalledExactlyOnceWith("docker", [
			"image",
			"rm",
			"test-app:tag",
		]);
	});
});
