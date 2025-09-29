import {
	dockerImageInspect,
	getCloudflareContainerRegistry,
	runDockerCmd,
} from "@cloudflare/containers-shared";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runWrangler } from "../helpers/run-wrangler";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		dockerLoginManagedRegistry: vi.fn(),
		runDockerCmd: vi.fn(),
		dockerImageInspect: vi.fn(),
	});
});

describe("containers push", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockApiToken();
	beforeEach(mockAccount);
	afterEach(vi.clearAllMocks);

	it("should help", async () => {
		await runWrangler("containers push --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers push [TAG]

			Push a tagged image to a Cloudflare managed registry

			POSITIONALS
			  TAG  [string]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --path-to-docker  Path to your docker binary if it's not on $PATH  [string] [default: \\"docker\\"]"
		`);
	});

	it("should push image with valid platform", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		vi.mocked(dockerImageInspect).mockResolvedValue("linux/amd64");
		expect(std.err).toMatchInlineSnapshot(`""`);

		await runWrangler("containers push test-app:tag");

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
	});

	it("should reject pushing image if platform is not linux/amd64", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		vi.mocked(dockerImageInspect).mockResolvedValue("linux/arm64");
		expect(std.err).toMatchInlineSnapshot(`""`);
		await expect(runWrangler("containers push test-app:tag")).rejects.toThrow(
			"Unsupported platform"
		);
	});

	it("should tag image with the correct uri if given an <image>:<tag> argument", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		vi.mocked(dockerImageInspect).mockResolvedValue("linux/amd64");
		expect(std.err).toMatchInlineSnapshot(`""`);

		await runWrangler("containers push test-app:tag");

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
	});

	it("should tag image with the correct uri if given an registry.cloudflare.com/<image>:<tag> argument", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		vi.mocked(dockerImageInspect).mockResolvedValue("linux/amd64");
		expect(std.err).toMatchInlineSnapshot(`""`);

		await runWrangler("containers push registry.cloudflare.com/test-app:tag");

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
	});

	it("should tag image with the correct uri if given an registry.cloudflare.com/some-account-id/<image>:<tag> argument", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		vi.mocked(dockerImageInspect).mockResolvedValue("linux/amd64");
		expect(std.err).toMatchInlineSnapshot(`""`);

		await runWrangler(
			"containers push registry.cloudflare.com/some-account-id/test-app:tag"
		);

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
	});
});
