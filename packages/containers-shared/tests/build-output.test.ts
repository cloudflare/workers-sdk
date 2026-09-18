import crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import {
	BUILD_OUTPUT_ROOT,
	getContainerConfigPath,
	getWorkerDir,
} from "@cloudflare/build-output-utils";
import { InputContainerSchema } from "@cloudflare/config";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	buildAndWriteContainerOutput,
	cleanupBuiltImages,
	normalizeContainerImageRepositoryName,
	runDockerCmdWithOutput,
	startContainerBuild,
	verifyDockerInstalled,
} from "../index";

vi.mock("../src/build", async (importOriginal) => ({
	...(await importOriginal()),
	cleanupBuiltImages: vi.fn(),
	startContainerBuild: vi.fn(),
}));
vi.mock("../src/utils", async (importOriginal) => ({
	...(await importOriginal()),
	runDockerCmdWithOutput: vi.fn(),
	verifyDockerInstalled: vi.fn(),
}));

const UUIDS: `${string}-${string}-${string}-${string}-${string}`[] = [
	"11111111-1111-4111-8111-111111111111",
	"22222222-2222-4222-8222-222222222222",
];
const BUILD_IDS = ["111111111111", "222222222222"];

let root: string;

describe("buildAndWriteContainerOutput", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
		root = fs.mkdtempSync(path.join(os.tmpdir(), "container-build-output-"));
		vi.spyOn(crypto, "randomUUID").mockReturnValue(UUIDS[0]);
		vi.mocked(runDockerCmdWithOutput).mockReturnValue("");
		vi.mocked(verifyDockerInstalled).mockResolvedValue(undefined);
		vi.mocked(startContainerBuild).mockResolvedValue({
			abort: vi.fn(),
			ready: Promise.resolve(),
		});
	});

	afterEach(() => {
		removeDirSync(root);
	});

	it("preserves remote references without invoking Docker", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "remote-container",
			image: { reference: "registry.example.com/app:latest" },
		});

		await buildAndWriteContainerOutput({
			containers: { remote: config },
			root,
			pathToDocker: "docker",
		});

		expect(verifyDockerInstalled).not.toHaveBeenCalled();
		expect(startContainerBuild).not.toHaveBeenCalled();
		expect(
			JSON.parse(
				fs.readFileSync(getContainerConfigPath(root, "remote"), "utf8")
			)
		).toEqual(config);
	});

	it("builds a standard Container with resolved paths and build variables", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "My Container",
			image: {
				dockerfile: "./container/Dockerfile",
				buildContext: "./container",
				buildVars: { VERSION: "1" },
			},
		});

		await buildAndWriteContainerOutput({
			containers: { app: config },
			root,
			pathToDocker: "/usr/bin/docker",
		});
		const localTag = expectedBuildOutputTag(root, "My Container", BUILD_IDS[0]);

		expect(verifyDockerInstalled).toHaveBeenCalledOnce();
		expect(startContainerBuild).toHaveBeenCalledWith({
			build: {
				tag: localTag,
				pathToDockerfile: path.resolve(root, "container/Dockerfile"),
				buildContext: path.resolve(root, "container"),
				args: { VERSION: "1" },
				platform: "linux/amd64",
			},
			pathToDocker: "/usr/bin/docker",
			verifyDockerIsRunning: false,
		});
		expect(
			JSON.parse(fs.readFileSync(getContainerConfigPath(root, "app"), "utf8"))
		).toEqual({
			...config,
			image: { localReference: localTag },
		});
	});

	it("uses a valid fallback when a Container name has no repository characters", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "🔥",
			image: { dockerfile: "./container/Dockerfile" },
		});

		await buildAndWriteContainerOutput({
			containers: { app: config },
			root,
			pathToDocker: "docker",
		});

		expect(startContainerBuild).toHaveBeenCalledWith(
			expect.objectContaining({
				build: expect.objectContaining({
					tag: expectedBuildOutputTag(root, "🔥", BUILD_IDS[0]),
				}),
			})
		);
	});

	it("trims project-scoped repository names to Docker's length limit", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "a".repeat(300),
			image: { dockerfile: "./container/Dockerfile" },
		});

		await buildAndWriteContainerOutput({
			containers: { app: config },
			root,
			pathToDocker: "docker",
		});

		const localTag =
			vi.mocked(startContainerBuild).mock.calls[0]?.[0].build.tag;
		expect(localTag?.slice(0, localTag.lastIndexOf(":"))).toHaveLength(255);
	});

	it("builds Durable Object named images and preserves remote images", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "Session Container",
			schedulingPolicy: "durable-object",
			images: {
				"Primary Image": { dockerfile: "./primary/Dockerfile" },
				fallback: { reference: "registry.example.com/fallback:latest" },
				worker: { dockerfile: "./worker/Dockerfile" },
			},
		});

		await buildAndWriteContainerOutput({
			containers: { sessions: config },
			root,
			pathToDocker: "docker",
		});
		const primaryTag = expectedBuildOutputTag(
			root,
			"Session Container-Primary Image",
			BUILD_IDS[0]
		);
		const workerTag = expectedBuildOutputTag(
			root,
			"Session Container-worker",
			BUILD_IDS[0]
		);

		expect(verifyDockerInstalled).toHaveBeenCalledOnce();
		expect(startContainerBuild).toHaveBeenCalledTimes(2);
		expect(startContainerBuild).toHaveBeenNthCalledWith(1, {
			build: {
				tag: primaryTag,
				pathToDockerfile: path.resolve(root, "primary/Dockerfile"),
				buildContext: path.resolve(root, "primary"),
				args: undefined,
				platform: "linux/amd64",
			},
			pathToDocker: "docker",
			verifyDockerIsRunning: false,
		});
		expect(startContainerBuild).toHaveBeenNthCalledWith(2, {
			build: {
				tag: workerTag,
				pathToDockerfile: path.resolve(root, "worker/Dockerfile"),
				buildContext: path.resolve(root, "worker"),
				args: undefined,
				platform: "linux/amd64",
			},
			pathToDocker: "docker",
			verifyDockerIsRunning: false,
		});
		expect(
			JSON.parse(
				fs.readFileSync(getContainerConfigPath(root, "sessions"), "utf8")
			)
		).toEqual({
			...config,
			images: {
				"Primary Image": {
					localReference: primaryTag,
				},
				fallback: { reference: "registry.example.com/fallback:latest" },
				worker: {
					localReference: workerTag,
				},
			},
		});
	});

	it("preserves a Durable Object Container with no images", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "Session Container",
			schedulingPolicy: "durable-object",
		});

		await buildAndWriteContainerOutput({
			containers: { sessions: config },
			root,
			pathToDocker: "docker",
		});

		expect(startContainerBuild).not.toHaveBeenCalled();
		expect(
			JSON.parse(
				fs.readFileSync(getContainerConfigPath(root, "sessions"), "utf8")
			)
		).toEqual(config);
	});

	it("cleans images built before a later build fails", async ({ expect }) => {
		const first = InputContainerSchema.parse({
			type: "container",
			name: "first",
			image: { dockerfile: "./first/Dockerfile" },
		});
		const second = InputContainerSchema.parse({
			type: "container",
			name: "second",
			image: { dockerfile: "./second/Dockerfile" },
		});
		vi.mocked(startContainerBuild)
			.mockResolvedValueOnce({ abort: vi.fn(), ready: Promise.resolve() })
			.mockResolvedValueOnce({
				abort: vi.fn(),
				ready: Promise.reject(new Error("build failed")),
			});
		seedWorkerOutput(root);

		await expect(
			buildAndWriteContainerOutput({
				containers: { first, second },
				root,
				pathToDocker: "docker",
			})
		).rejects.toThrow("build failed");
		expect(fs.existsSync(getBuildOutputPath(root))).toBe(false);
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[
				{
					localTag: expectedBuildOutputTag(root, "first", BUILD_IDS[0]),
				},
			],
			"docker"
		);
	});

	it("removes partial output and current build tags when writing fails", async ({
		expect,
	}) => {
		const first = InputContainerSchema.parse({
			type: "container",
			name: "first",
			image: { dockerfile: "./first/Dockerfile" },
		});
		const second = InputContainerSchema.parse({
			type: "container",
			name: "second",
			image: { dockerfile: "./second/Dockerfile" },
		});
		seedWorkerOutput(root);

		await expect(
			buildAndWriteContainerOutput({
				containers: { first, "invalid/name": second },
				root,
				pathToDocker: "docker",
			})
		).rejects.toThrow("Container directory names");
		expect(fs.existsSync(getBuildOutputPath(root))).toBe(false);
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[
				{
					localTag: expectedBuildOutputTag(root, "first", BUILD_IDS[0]),
				},
				{
					localTag: expectedBuildOutputTag(root, "second", BUILD_IDS[0]),
				},
			],
			"docker"
		);
	});

	it("removes complete output when Docker verification fails", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "app",
			image: { dockerfile: "./Dockerfile" },
		});
		vi.mocked(verifyDockerInstalled).mockRejectedValue(
			new Error("Docker is unavailable")
		);
		seedWorkerOutput(root);

		await expect(
			buildAndWriteContainerOutput({
				containers: { app: config },
				root,
				pathToDocker: "docker",
			})
		).rejects.toThrow("Docker is unavailable");
		expect(fs.existsSync(getBuildOutputPath(root))).toBe(false);
		expect(startContainerBuild).not.toHaveBeenCalled();
	});

	it("removes the previous tag before rebuilding deleted output", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "api",
			image: { dockerfile: "./Dockerfile" },
		});
		const firstTag = expectedBuildOutputTag(root, "api", BUILD_IDS[0]);
		const secondTag = expectedBuildOutputTag(root, "api", BUILD_IDS[1]);
		vi.mocked(runDockerCmdWithOutput)
			.mockReturnValueOnce("")
			.mockReturnValueOnce(firstTag);
		vi.mocked(crypto.randomUUID)
			.mockReturnValueOnce(UUIDS[0])
			.mockReturnValueOnce(UUIDS[1]);

		await buildAndWriteContainerOutput({
			containers: { app: config },
			root,
			pathToDocker: "docker",
		});
		removeDirSync(path.resolve(root, ".cloudflare/output"));
		await buildAndWriteContainerOutput({
			containers: { app: config },
			root,
			pathToDocker: "docker",
		});

		expect(startContainerBuild).toHaveBeenCalledTimes(2);
		expect(vi.mocked(startContainerBuild).mock.calls[0]?.[0].build.tag).toBe(
			firstTag
		);
		expect(vi.mocked(startContainerBuild).mock.calls[1]?.[0].build.tag).toBe(
			secondTag
		);
		expect(cleanupBuiltImages).toHaveBeenCalledOnce();
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[{ localTag: firstTag }],
			"docker"
		);
	});

	it("removes previous project-scoped tags at build start", async ({
		expect,
	}) => {
		const staleTag = expectedBuildOutputTag(root, "old-api", BUILD_IDS[1]);
		vi.mocked(runDockerCmdWithOutput).mockReturnValue(staleTag);

		await buildAndWriteContainerOutput({
			containers: {},
			root,
			pathToDocker: "docker",
		});

		expect(verifyDockerInstalled).not.toHaveBeenCalled();
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[{ localTag: staleTag }],
			"docker"
		);
	});

	it("rejects image names that normalize to the same repository", async ({
		expect,
	}) => {
		const first = InputContainerSchema.parse({
			type: "container",
			name: "My API",
			image: { dockerfile: "./first/Dockerfile" },
		});
		const second = InputContainerSchema.parse({
			type: "container",
			name: "my-api",
			image: { dockerfile: "./second/Dockerfile" },
		});

		await expect(
			buildAndWriteContainerOutput({
				containers: { first, second },
				root,
				pathToDocker: "docker",
			})
		).rejects.toThrow("conflicts with another image");
		expect(startContainerBuild).toHaveBeenCalledOnce();
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[
				{
					localTag: expectedBuildOutputTag(root, "My API", BUILD_IDS[0]),
				},
			],
			"docker"
		);
	});

	it("does not require Docker to clean a registry-only build", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "remote-container",
			image: { reference: "registry.example.com/app:latest" },
		});
		vi.mocked(runDockerCmdWithOutput).mockImplementation(() => {
			throw new Error("Docker is unavailable");
		});

		await expect(
			buildAndWriteContainerOutput({
				containers: { remote: config },
				root,
				pathToDocker: "docker",
			})
		).resolves.toBeUndefined();
		expect(verifyDockerInstalled).not.toHaveBeenCalled();
	});
});

function expectedBuildOutputTag(
	rootDirectory: string,
	repositoryName: string,
	buildId: string
): string {
	const projectHash = shortHash(path.resolve(rootDirectory));
	const repositoryPrefix = `cloudflare-build/${projectHash}/`;
	const maxNameLength = 255 - repositoryPrefix.length;
	const normalizedName = normalizeContainerImageRepositoryName(repositoryName)
		.slice(0, maxNameLength)
		.replace(/[._-]+$/g, "");
	return `${repositoryPrefix}${normalizedName}:${buildId}`;
}

function seedWorkerOutput(rootDirectory: string): void {
	const workerDirectory = getWorkerDir(rootDirectory);
	fs.mkdirSync(workerDirectory, { recursive: true });
	fs.writeFileSync(path.join(workerDirectory, "config.json"), "{}");
}

function getBuildOutputPath(rootDirectory: string): string {
	return path.resolve(rootDirectory, BUILD_OUTPUT_ROOT);
}

function shortHash(value: string): string {
	return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}
