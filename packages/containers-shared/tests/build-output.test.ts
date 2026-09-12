import crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import {
	getContainerConfigPath,
	getContainersDir,
} from "@cloudflare/build-output-utils";
import { InputContainerSchema } from "@cloudflare/config";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	buildAndWriteContainerOutput,
	cleanupBuiltImages,
	normalizeContainerImageRepositoryName,
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
	verifyDockerInstalled: vi.fn(),
}));

const UUIDS: `${string}-${string}-${string}-${string}-${string}`[] = [
	"11111111-1111-4111-8111-111111111111",
	"22222222-2222-4222-8222-222222222222",
];

let root: string;

describe("buildAndWriteContainerOutput", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
		root = fs.mkdtempSync(path.join(os.tmpdir(), "container-build-output-"));
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(UUIDS[0])
			.mockReturnValueOnce(UUIDS[1]);
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

		expect(verifyDockerInstalled).toHaveBeenCalledOnce();
		expect(startContainerBuild).toHaveBeenCalledWith({
			build: {
				tag: `my-container:${UUIDS[0]}`,
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
			image: { localReference: `my-container:${UUIDS[0]}` },
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
					tag: `container:${UUIDS[0]}`,
				}),
			})
		);
	});

	it("trims repository names to Docker's length limit", ({ expect }) => {
		expect(normalizeContainerImageRepositoryName("a".repeat(300))).toBe(
			"a".repeat(255)
		);
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

		expect(verifyDockerInstalled).toHaveBeenCalledOnce();
		expect(startContainerBuild).toHaveBeenCalledTimes(2);
		expect(startContainerBuild).toHaveBeenNthCalledWith(1, {
			build: {
				tag: `session-container-primary-image:${UUIDS[0]}`,
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
				tag: `session-container-worker:${UUIDS[1]}`,
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
					localReference: `session-container-primary-image:${UUIDS[0]}`,
				},
				fallback: { reference: "registry.example.com/fallback:latest" },
				worker: {
					localReference: `session-container-worker:${UUIDS[1]}`,
				},
			},
		});
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

		await expect(
			buildAndWriteContainerOutput({
				containers: { first, second },
				root,
				pathToDocker: "docker",
			})
		).rejects.toThrow("build failed");
		expect(fs.existsSync(getContainersDir(root))).toBe(false);
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[{ localTag: `first:${UUIDS[0]}` }],
			"docker"
		);
	});

	it("removes partial output and built tags when writing fails", async ({
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

		await expect(
			buildAndWriteContainerOutput({
				containers: { first, "invalid/name": second },
				root,
				pathToDocker: "docker",
			})
		).rejects.toThrow("Container directory names");
		expect(fs.existsSync(getContainersDir(root))).toBe(false);
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[{ localTag: `first:${UUIDS[0]}` }, { localTag: `second:${UUIDS[1]}` }],
			"docker"
		);
	});
});
