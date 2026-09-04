import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	AccountService,
	buildCommand,
	buildContainerImages,
	getCloudflareContainerRegistry,
	getContainerImageTag,
	initContainersSharedContext,
	InstanceType,
	pushBuiltContainerImage,
	pushCommand,
	SchedulingPolicy,
} from "../index";
import type { CompleteAccountCustomer } from "../src/client";
import type { ContainerNormalizedConfig } from "../src/types";
import type { FetchResultFetcher, Logger } from "@cloudflare/workers-utils";

vi.mock("node:child_process");

const dockerfile = "FROM node:22\n";

const logger: Logger = {
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

const account = {
	external_account_id: "some-account-id",
	limits: {
		vcpu_per_deployment: 1,
		memory_mib_per_deployment: 1024,
		disk_mb_per_deployment: 4000,
	},
} as CompleteAccountCustomer;

const dockerfileContainer = {
	name: "test-app",
	class_name: "ExampleDurableObject",
	dockerfile: "/tmp/Dockerfile",
	image_build_context: "/tmp",
	max_instances: 10,
	scheduling_policy: SchedulingPolicy.DEFAULT,
	rollout_step_percentage: [100],
	rollout_kind: "full_auto",
	rollout_active_grace_period: 0,
	instance_type: InstanceType.DEV,
	constraints: {},
	observability: { logs_enabled: true },
} satisfies ContainerNormalizedConfig;

let inspectOutputs: string[];
let tempDirs: string[];
let fetchResultMock: FetchResultFetcher;

function createBuildArgs() {
	const dir = mkdtempSync(join(tmpdir(), "containers-shared-build-"));
	const pathToDockerfile = join(dir, "Dockerfile");
	writeFileSync(pathToDockerfile, dockerfile);
	return {
		dir,
		args: {
			tag: "test-app:tag",
			pathToDockerfile,
			buildContext: dir,
		},
	};
}

function createFakeChildProcess(args: string[]): ChildProcess {
	const child = new EventEmitter() as ChildProcess;
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const stdin = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		},
	});

	Object.assign(child, {
		pid: 1234,
		stdout,
		stderr,
		stdin,
		unref: vi.fn(),
		kill: vi.fn(),
	});

	process.nextTick(() => {
		if (args[0] === "image" && args[1] === "inspect") {
			stdout.emit("data", inspectOutputs.shift() ?? "");
		}
		child.emit("exit", 0);
		child.emit("close", 0);
	});

	return child;
}

function mockDockerProcesses() {
	vi.mocked(spawn).mockImplementation((_dockerPath, args) =>
		createFakeChildProcess(Array.from(args ?? []))
	);
}

function expectSpawnWith(args: string[]) {
	const calls = vi.mocked(spawn).mock.calls;
	const match = calls.find(([, actualArgs]) => {
		return JSON.stringify(actualArgs) === JSON.stringify(args);
	});
	if (!match) {
		throw new Error(
			`Expected spawn to be called with ${JSON.stringify(args)}, got ${JSON.stringify(
				calls.map(([, actualArgs]) => actualArgs)
			)}`
		);
	}
}

function expectSpawnCommandWith(dockerPath: string, args: string[]) {
	const calls = vi.mocked(spawn).mock.calls;
	const match = calls.find(([actualDockerPath, actualArgs]) => {
		return (
			actualDockerPath === dockerPath &&
			JSON.stringify(actualArgs) === JSON.stringify(args)
		);
	});
	if (!match) {
		throw new Error(
			`Expected spawn to be called with ${dockerPath} ${JSON.stringify(
				args
			)}, got ${JSON.stringify(
				calls.map(([actualDockerPath, actualArgs]) => [
					actualDockerPath,
					actualArgs,
				])
			)}`
		);
	}
}

function expectNoSpawnWith(args: string[]) {
	const calls = vi.mocked(spawn).mock.calls;
	const match = calls.find(([, actualArgs]) => {
		return JSON.stringify(actualArgs) === JSON.stringify(args);
	});
	if (match) {
		throw new Error(
			`Expected spawn not to be called with ${JSON.stringify(args)}`
		);
	}
}

describe("buildCommand", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tempDirs = [];
		inspectOutputs = [
			"[]",
			"53387881 2",
			'["registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
		];
		mockDockerProcesses();
		vi.mocked(execFileSync).mockReturnValue(
			'{"Descriptor":{"digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}'
		);
		vi.spyOn(AccountService, "getMe").mockResolvedValue(account);
		fetchResultMock = vi.fn(
			async <ResponseType>(
				_config: Parameters<FetchResultFetcher>[0],
				path: string
			) => {
				if (path === "/accounts/some-account-id/containers/me") {
					return account as ResponseType;
				}
				if (
					path ===
					"/accounts/some-account-id/containers/registries/registry.cloudflare.com/credentials"
				) {
					return {
						account_id: "some-account-id",
						username: "username",
						password: "password",
						registry_host: getCloudflareContainerRegistry(),
					} as ResponseType;
				}
				throw new Error(`Unexpected fetchResult path: ${path}`);
			}
		) as FetchResultFetcher;
		initContainersSharedContext({ logger, fetchResult: fetchResultMock });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		for (const dir of tempDirs) {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	it("builds without pushing when push is false", async ({ expect }) => {
		const { dir, args } = createBuildArgs();
		tempDirs.push(dir);

		await expect(
			buildCommand({
				PATH: dir,
				tag: args.tag,
				pathToDocker: "docker",
				push: false,
			})
		).resolves.toBeUndefined();

		expectSpawnWith([
			"build",
			"--load",
			"-t",
			"test-app:tag",
			"--platform",
			"linux/amd64",
			"--provenance=false",
			"-f",
			"-",
			dir,
		]);
	});

	it("tags and pushes new images, returning the pushed digest", async ({
		expect,
	}) => {
		const { dir, args } = createBuildArgs();
		tempDirs.push(dir);

		await expect(
			buildCommand({
				PATH: dir,
				tag: args.tag,
				pathToDocker: "docker",
				push: true,
			})
		).resolves.toBeUndefined();

		expectSpawnWith([
			"image",
			"inspect",
			"test-app:tag",
			"--format",
			"{{ json .RepoDigests }}",
		]);
		expectSpawnWith([
			"image",
			"inspect",
			"test-app:tag",
			"--format",
			"{{ .Size }} {{ len .RootFS.Layers }}",
		]);
		expect(vi.mocked(fetchResultMock)).toHaveBeenCalledWith(
			{},
			"/accounts/some-account-id/containers/registries/registry.cloudflare.com/credentials",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					expiration_minutes: 15,
					permissions: ["push", "pull"],
				}),
			}
		);
		expectSpawnWith([
			"tag",
			"test-app:tag",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expectSpawnWith([
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
	});

	it("skips pushing when the remote digest already exists", async ({
		expect,
	}) => {
		const { dir, args } = createBuildArgs();
		tempDirs.push(dir);
		inspectOutputs = [
			'["registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
			"53387881 2",
		];
		vi.mocked(execFileSync).mockReturnValue(
			'{"Descriptor":{"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}'
		);

		await expect(
			buildCommand({
				PATH: dir,
				tag: args.tag,
				pathToDocker: "docker",
				push: true,
			})
		).resolves.toBeUndefined();

		expectSpawnWith(["image", "rm", "test-app:tag"]);
		expectNoSpawnWith([
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
	});

	it("uses docker manifest inspect when pushed image inspect has no digest", async ({
		expect,
	}) => {
		const { dir, args } = createBuildArgs();
		tempDirs.push(dir);
		inspectOutputs = ["[]", "53387881 2", ""];

		await expect(
			buildCommand({
				PATH: dir,
				tag: args.tag,
				pathToDocker: "docker",
				push: true,
			})
		).resolves.toBeUndefined();
		expect(execFileSync).toHaveBeenCalledWith(
			"docker",
			[
				"manifest",
				"inspect",
				"-v",
				`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
			],
			{ encoding: "utf8" }
		);
	});
});

describe("deploy container image build and push", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tempDirs = [];
		inspectOutputs = [
			"[]",
			"53387881 2",
			'["registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
		];
		mockDockerProcesses();
		vi.spyOn(crypto, "randomUUID").mockReturnValue(
			"11111111-1111-4111-8111-111111111111"
		);
		vi.spyOn(AccountService, "getMe").mockResolvedValue(account);
		fetchResultMock = vi.fn(
			async <ResponseType>(
				_config: Parameters<FetchResultFetcher>[0],
				path: string
			) => {
				if (path === "/accounts/some-account-id/containers/me") {
					return account as ResponseType;
				}
				if (
					path ===
					"/accounts/some-account-id/containers/registries/registry.cloudflare.com/credentials"
				) {
					return {
						account_id: "some-account-id",
						username: "username",
						password: "password",
						registry_host: getCloudflareContainerRegistry(),
					} as ResponseType;
				}
				throw new Error(`Unexpected fetchResult path: ${path}`);
			}
		) as FetchResultFetcher;
		initContainersSharedContext({ logger, fetchResult: fetchResultMock });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("builds Dockerfile containers and pairs each build with the original config", async ({
		expect,
	}) => {
		const { dir, args } = createBuildArgs();
		tempDirs.push(dir);
		const container = {
			...dockerfileContainer,
			dockerfile: args.pathToDockerfile,
			image_build_context: dir,
		};
		const imageUriContainer = {
			...dockerfileContainer,
			dockerfile: undefined,
			image_build_context: undefined,
			image_uri: "registry.cloudflare.com/some-account-id/test-app:tag",
		} as unknown as ContainerNormalizedConfig;
		delete (imageUriContainer as Record<string, unknown>).dockerfile;
		delete (imageUriContainer as Record<string, unknown>).image_build_context;

		await expect(
			buildContainerImages([container, imageUriContainer], "docker", false)
		).resolves.toStrictEqual([
			{
				container,
				builtImage: {
					containerConfig: container,
					localTag: "test-app:wrangler-11111111-1111-4111-8111-111111111111",
				},
			},
		]);
	});

	it("lowercases Docker image repository names for local and canonical tags", async ({
		expect,
	}) => {
		const { dir, args } = createBuildArgs();
		tempDirs.push(dir);
		const container = {
			...dockerfileContainer,
			name: "Test-App",
			dockerfile: args.pathToDockerfile,
			image_build_context: dir,
		};

		await expect(
			buildContainerImages([container], "docker", false)
		).resolves.toStrictEqual([
			{
				container,
				builtImage: {
					containerConfig: container,
					localTag: "test-app:wrangler-11111111-1111-4111-8111-111111111111",
				},
			},
		]);
		expect(getContainerImageTag(container, "Galaxy-Class")).toBe(
			"test-app:Galaxy"
		);
	});

	it("retags and pushes a built image using the Worker version ID tag", async ({
		expect,
	}) => {
		await expect(
			pushBuiltContainerImage(
				{
					containerConfig: dockerfileContainer,
					localTag: "test-app:wrangler-11111111-1111-4111-8111-111111111111",
				},
				"Galaxy-Class",
				"docker",
				"some-account-id",
				undefined
			)
		).resolves.toStrictEqual({
			remoteDigest:
				"registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});
		expect(vi.mocked(fetchResultMock)).toHaveBeenCalledWith(
			{},
			"/accounts/some-account-id/containers/me"
		);

		expectSpawnWith([
			"image",
			"inspect",
			"test-app:wrangler-11111111-1111-4111-8111-111111111111",
			"--format",
			"{{ json .RepoDigests }}",
		]);
		expectSpawnWith([
			"image",
			"inspect",
			"test-app:wrangler-11111111-1111-4111-8111-111111111111",
			"--format",
			"{{ .Size }} {{ len .RootFS.Layers }}",
		]);
		expectSpawnWith([
			"tag",
			"test-app:wrangler-11111111-1111-4111-8111-111111111111",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:Galaxy`,
		]);
		expectSpawnWith([
			"image",
			"rm",
			"test-app:wrangler-11111111-1111-4111-8111-111111111111",
		]);
		expectSpawnWith([
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:Galaxy`,
		]);
		const tagCallIndex = vi
			.mocked(spawn)
			.mock.calls.findIndex(
				([, args]) =>
					JSON.stringify(args) ===
					JSON.stringify([
						"tag",
						"test-app:wrangler-11111111-1111-4111-8111-111111111111",
						`${getCloudflareContainerRegistry()}/some-account-id/test-app:Galaxy`,
					])
			);
		const cleanupCallIndex = vi
			.mocked(spawn)
			.mock.calls.findIndex(
				([, args]) =>
					JSON.stringify(args) ===
					JSON.stringify([
						"image",
						"rm",
						"test-app:wrangler-11111111-1111-4111-8111-111111111111",
					])
			);
		const pushCallIndex = vi
			.mocked(spawn)
			.mock.calls.findIndex(
				([, args]) =>
					JSON.stringify(args) ===
					JSON.stringify([
						"push",
						`${getCloudflareContainerRegistry()}/some-account-id/test-app:Galaxy`,
					])
			);
		expect(tagCallIndex).toBeLessThan(cleanupCallIndex);
		expect(cleanupCallIndex).toBeLessThan(pushCallIndex);
	});

	it("derives production tags from version IDs, not Worker tags", ({
		expect,
	}) => {
		expect(getContainerImageTag(dockerfileContainer, "Galaxy-Class")).toBe(
			"test-app:Galaxy"
		);
		expect(
			getContainerImageTag(
				dockerfileContainer,
				"11111111-2222-4333-8444-555555555555"
			)
		).toBe("test-app:11111111");
	});
});

describe("buildCommand arguments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tempDirs = [];
		inspectOutputs = [];
		mockDockerProcesses();
		initContainersSharedContext({ logger, fetchResult: vi.fn() });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		for (const dir of tempDirs) {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	it("uses the explicit Docker path", async ({ expect }) => {
		const { dir } = createBuildArgs();
		tempDirs.push(dir);

		await expect(
			buildCommand({
				PATH: dir,
				tag: "test-app:tag",
				pathToDocker: "/custom/docker",
				push: false,
				platform: "linux/amd64",
			})
		).resolves.toBeUndefined();

		expectSpawnCommandWith("/custom/docker", [
			"build",
			"--load",
			"-t",
			"test-app:tag",
			"--platform",
			"linux/amd64",
			"--provenance=false",
			"-f",
			"-",
			dir,
		]);
	});
});

describe("pushCommand", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		inspectOutputs = ["linux/amd64"];
		mockDockerProcesses();
		fetchResultMock = vi.fn(
			async <ResponseType>(
				_config: Parameters<FetchResultFetcher>[0],
				path: string
			) => {
				if (
					path ===
					"/accounts/some-account-id/containers/registries/registry.cloudflare.com/credentials"
				) {
					return {
						account_id: "some-account-id",
						username: "username",
						password: "password",
						registry_host: getCloudflareContainerRegistry(),
					} as ResponseType;
				}
				throw new Error(`Unexpected fetchResult path: ${path}`);
			}
		) as FetchResultFetcher;
		initContainersSharedContext({ logger, fetchResult: fetchResultMock });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("validates platform, tags, and pushes to the managed registry", async ({
		expect,
	}) => {
		await pushCommand(
			{ TAG: "test-app:tag", pathToDocker: "docker" },
			"some-account-id"
		);

		expect(vi.mocked(fetchResultMock)).toHaveBeenCalledWith(
			{},
			"/accounts/some-account-id/containers/registries/registry.cloudflare.com/credentials",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					expiration_minutes: 15,
					permissions: ["push", "pull"],
				}),
			}
		);
		expectSpawnWith([
			"image",
			"inspect",
			"test-app:tag",
			"--format",
			"{{ .Os }}/{{ .Architecture }}",
		]);
		expectSpawnWith([
			"tag",
			"test-app:tag",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
		expectSpawnWith([
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
	});

	it("rejects unsupported image platforms", async ({ expect }) => {
		inspectOutputs = ["linux/arm64"];

		await expect(
			pushCommand(
				{ TAG: "test-app:tag", pathToDocker: "docker" },
				"some-account-id"
			)
		).rejects.toThrow("Unsupported platform");
		expectNoSpawnWith([
			"push",
			`${getCloudflareContainerRegistry()}/some-account-id/test-app:tag`,
		]);
	});
});
