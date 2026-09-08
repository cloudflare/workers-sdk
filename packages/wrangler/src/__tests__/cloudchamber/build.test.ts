import { mkdirSync, writeFileSync } from "node:fs";
import {
	buildAndMaybePushContainerImage,
	checkImagePlatform,
	initContainersSharedContext,
	pushContainerImage,
} from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		buildAndMaybePushContainerImage: vi.fn(async () => ({
			remoteDigest:
				"registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		})),
		checkImagePlatform: vi.fn(),
		initContainersSharedContext: vi.fn(),
		pushContainerImage: vi.fn(async () => ({
			remoteDigest:
				"registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		})),
	});
});

const dockerfile =
	'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "index.js"]';

describe("cloudchamber build and push commands", () => {
	runInTempDir();
	mockApiToken();
	mockAccountId();
	mockConsoleMethods();

	beforeEach(() => {
		vi.clearAllMocks();
		setWranglerConfig({});
		mkdirSync("./container-context", { recursive: true });
		writeFileSync("./container-context/Dockerfile", dockerfile);
		mockAccount();
	});

	it("builds without initializing the shared API context when not pushing", async ({
		expect,
	}) => {
		await runWrangler("cloudchamber build ./container-context -t test-app:tag");

		expect(initContainersSharedContext).not.toHaveBeenCalled();
		expect(buildAndMaybePushContainerImage).toHaveBeenCalledWith(
			expect.objectContaining({
				args: expect.objectContaining({
					tag: "test-app:tag",
					pathToDockerfile: "container-context/Dockerfile",
					buildContext: "./container-context",
					platform: "linux/amd64",
				}),
				pathToDocker: "docker",
				push: false,
			})
		);
	});

	it("uses the cloudchamber API family when building and pushing", async ({
		expect,
	}) => {
		await runWrangler(
			"cloudchamber build ./container-context -t test-app:tag -p"
		);

		expect(initContainersSharedContext).toHaveBeenCalledWith(
			expect.objectContaining({
				accountId: "some-account-id",
				apiFamily: "cloudchamber",
			})
		);
		expect(buildAndMaybePushContainerImage).toHaveBeenCalledWith(
			expect.objectContaining({
				args: expect.objectContaining({ tag: "test-app:tag" }),
				push: true,
			})
		);
	});

	it("uses the cloudchamber API family when pushing an existing image", async ({
		expect,
	}) => {
		await runWrangler("cloudchamber push test-app:tag");

		expect(initContainersSharedContext).toHaveBeenCalledWith(
			expect.objectContaining({
				accountId: "some-account-id",
				apiFamily: "cloudchamber",
			})
		);
		expect(checkImagePlatform).toHaveBeenCalledWith("docker", "test-app:tag");
		expect(pushContainerImage).toHaveBeenCalledWith(
			expect.objectContaining({
				imageTag: "test-app:tag",
				pathToDocker: "docker",
			})
		);
	});
});
