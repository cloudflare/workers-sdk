import crypto from "node:crypto";
import path from "node:path";
import { InputContainerSchema } from "@cloudflare/config";
import { beforeEach, describe, it, vi } from "vitest";
import {
	buildAndMaybePush,
	buildOutputContainerConfigs,
	cleanupBuiltImages,
	verifyDockerInstalled,
} from "../index";

vi.mock("../src/build", async (importOriginal) => ({
	...(await importOriginal()),
	buildAndMaybePush: vi.fn(),
	cleanupBuiltImages: vi.fn(),
}));
vi.mock("../src/utils", async (importOriginal) => ({
	...(await importOriginal()),
	verifyDockerInstalled: vi.fn(),
}));

const UUIDS: `${string}-${string}-${string}-${string}-${string}`[] = [
	"11111111-1111-4111-8111-111111111111",
	"22222222-2222-4222-8222-222222222222",
];

describe("buildOutputContainerConfigs", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(UUIDS[0])
			.mockReturnValueOnce(UUIDS[1]);
		vi.mocked(buildAndMaybePush).mockImplementation(async (args) => ({
			newTag: args.tag,
		}));
	});

	it("preserves remote references without invoking Docker", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "remote-container",
			image: { reference: "registry.example.com/app:latest" },
		});

		await expect(
			buildOutputContainerConfigs({
				containers: [{ directoryName: "remote", config }],
				root: "/project",
				pathToDocker: "docker",
			})
		).resolves.toEqual({
			containers: [
				{
					directoryName: "remote",
					config: {
						...config,
						image: { reference: "registry.example.com/app:latest" },
					},
				},
			],
			builtImages: [],
		});
		expect(verifyDockerInstalled).not.toHaveBeenCalled();
		expect(buildAndMaybePush).not.toHaveBeenCalled();
	});

	it("builds a standard Container with resolved paths and build variables", async ({
		expect,
	}) => {
		const config = InputContainerSchema.parse({
			type: "container",
			name: "My-Container",
			image: {
				dockerfile: "./container/Dockerfile",
				buildContext: "./container",
				buildVars: { VERSION: "1" },
			},
		});

		const result = await buildOutputContainerConfigs({
			containers: [{ directoryName: "app", config }],
			root: "/project",
			pathToDocker: "/usr/bin/docker",
		});

		expect(verifyDockerInstalled).toHaveBeenCalledOnce();
		expect(buildAndMaybePush).toHaveBeenCalledWith(
			{
				tag: `my-container:wrangler-${UUIDS[0]}`,
				pathToDockerfile: path.resolve("/project", "container/Dockerfile"),
				buildContext: path.resolve("/project", "container"),
				args: { VERSION: "1" },
				platform: "linux/amd64",
			},
			"/usr/bin/docker",
			false,
			undefined,
			false
		);
		expect(result.containers[0]?.config).toEqual({
			...config,
			image: { localReference: `my-container:wrangler-${UUIDS[0]}` },
		});
		expect(result.builtImages).toEqual([
			{ localTag: `my-container:wrangler-${UUIDS[0]}` },
		]);
	});

	it("builds each Durable Object named image with a sanitized repository", async ({
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

		const result = await buildOutputContainerConfigs({
			containers: [{ directoryName: "sessions", config }],
			root: "/project",
			pathToDocker: "docker",
		});

		expect(verifyDockerInstalled).toHaveBeenCalledOnce();
		expect(buildAndMaybePush).toHaveBeenCalledTimes(2);
		expect(result.containers[0]?.config).toEqual({
			...config,
			images: {
				"Primary Image": {
					localReference: `session-container-primary-image:wrangler-${UUIDS[0]}`,
				},
				fallback: { reference: "registry.example.com/fallback:latest" },
				worker: {
					localReference: `session-container-worker:wrangler-${UUIDS[1]}`,
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
		vi.mocked(buildAndMaybePush)
			.mockResolvedValueOnce({ newTag: `first:wrangler-${UUIDS[0]}` })
			.mockRejectedValueOnce(new Error("build failed"));

		await expect(
			buildOutputContainerConfigs({
				containers: [
					{ directoryName: "first", config: first },
					{ directoryName: "second", config: second },
				],
				root: "/project",
				pathToDocker: "docker",
			})
		).rejects.toThrow("build failed");
		expect(cleanupBuiltImages).toHaveBeenCalledWith(
			[{ localTag: `first:wrangler-${UUIDS[0]}` }],
			"docker"
		);
	});
});
