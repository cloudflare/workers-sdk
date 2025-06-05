import { mkdirSync, writeFileSync } from "fs";
import {
	dockerLoginManagedRegistry,
	DOMAIN,
	runDockerCmd,
} from "@cloudflare/containers-shared";
import { UserError } from "../../errors";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount } from "./utils";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		dockerLoginManagedRegistry: vi.fn(),
		runDockerCmd: vi.fn(),
	});
});

describe("buildAndMaybePush", () => {
	runInTempDir();
	mockApiToken();
	mockAccountId();
	mockAccount();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("WRANGLER_CONTAINERS_DOCKER_PATH", "/usr/bin/docker");
		mkdirSync("./container-context");
		writeFileSync(
			"./container-context/Dockerfile",
			'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "index.js"]'
		);
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should be able to build image and push", async () => {
		await runWrangler("containers build . -t test-app:tag -p");

		expect(runDockerCmd).toHaveBeenCalledTimes(2);
		expect(runDockerCmd).toHaveBeenCalledWith("/usr/bin/docker", [
			"build",
			"-t",
			`${DOMAIN}/test-app:tag`,
			"--platform",
			"linux/amd64",
			"-f",
			"Dockerfile",
			".",
		]);

		expect(runDockerCmd).toHaveBeenCalledWith("/usr/bin/docker", [
			"push",
			`${DOMAIN}/test-app:tag`,
		]);

		expect(dockerLoginManagedRegistry).toHaveBeenCalledWith("/usr/bin/docker");
	});

	it("should be able to build image and not push", async () => {
		await runWrangler("containers build . -t test-app");
		expect(runDockerCmd).toHaveBeenCalledTimes(1);
		expect(runDockerCmd).toHaveBeenCalledWith("/usr/bin/docker", [
			"build",
			"-t",
			`${DOMAIN}/test-app`,
			"--platform",
			"linux/amd64",
			"-f",
			"Dockerfile",
			".",
		]);

		expect(dockerLoginManagedRegistry).not.toHaveBeenCalled();
	});

	it("should add --network=host flag if WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST is set", async () => {
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST", "true");
		await runWrangler("containers build . -t test-app");
		expect(runDockerCmd).toHaveBeenCalledTimes(1);
		expect(runDockerCmd).toHaveBeenCalledWith("/usr/bin/docker", [
			"build",
			"-t",
			`${DOMAIN}/test-app`,
			"--platform",
			"linux/amd64",
			"--network",
			"host",
			"-f",
			"Dockerfile",
			".",
		]);
	});

	it("should throw UserError when docker build fails", async () => {
		const errorMessage = "Docker build failed";
		vi.mocked(runDockerCmd).mockRejectedValue(new Error(errorMessage));
		await expect(
			runWrangler("containers build . -t test-app:tag")
		).rejects.toThrow(new UserError(errorMessage));
	});

	it("should throw UserError when docker login fails", async () => {
		const errorMessage = "Docker login failed";
		vi.mocked(runDockerCmd).mockResolvedValue();
		vi.mocked(dockerLoginManagedRegistry).mockRejectedValue(
			new Error(errorMessage)
		);
		await expect(
			runWrangler("containers build . -t test-app:tag -p")
		).rejects.toThrow(new UserError(errorMessage));
	});
});
