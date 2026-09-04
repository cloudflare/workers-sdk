import {
	checkImagePlatform,
	initContainersSharedContext,
	pushContainerImage,
} from "@cloudflare/containers-shared";
import { beforeEach, describe, it, vi } from "vitest";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runWrangler } from "../helpers/run-wrangler";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		checkImagePlatform: vi.fn(),
		initContainersSharedContext: vi.fn(),
		pushContainerImage: vi.fn(async () => ({
			remoteDigest:
				"registry.cloudflare.com/some-account-id/test-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		})),
	});
});

describe("containers push", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	beforeEach(() => {
		vi.clearAllMocks();
		setIsTTY(false);
		setWranglerConfig({});
	});

	it("should help", async ({ expect }) => {
		await runWrangler("containers push --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers push <TAG>

			Push a local image to the Cloudflare managed registry

			POSITIONALS
			  TAG  The tag of the local image to push  [string] [required]

			GLOBAL FLAGS
			  -c, --config          Path to Wrangler configuration file  [string]
			      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help            Show help  [boolean]
			      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
			      --profile         Use a specific auth profile  [string]
			  -v, --version         Show version number  [boolean]

			OPTIONS
			      --path-to-docker  Path to your docker binary if it's not on $PATH  [string] [default: "docker"]"
		`);
	});

	it("initializes containers shared with the containers API family", async ({
		expect,
	}) => {
		await runWrangler("containers push test-app:tag");

		expect(initContainersSharedContext).toHaveBeenCalledWith(
			expect.objectContaining({
				accountId: "some-account-id",
				apiFamily: "containers",
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

	it("uses a custom Docker path when provided", async ({ expect }) => {
		await runWrangler(
			"containers push test-app:tag --path-to-docker /custom/docker"
		);

		expect(checkImagePlatform).toHaveBeenCalledWith(
			"/custom/docker",
			"test-app:tag"
		);
		expect(pushContainerImage).toHaveBeenCalledWith(
			expect.objectContaining({
				imageTag: "test-app:tag",
				pathToDocker: "/custom/docker",
			})
		);
	});
});
