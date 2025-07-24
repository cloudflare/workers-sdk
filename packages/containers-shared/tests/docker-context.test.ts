import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDockerHost } from "../src/utils";

const mockedDockerContextLsOutput = `{"Current":true,"Description":"Current DOCKER_HOST based configuration","DockerEndpoint":"unix:///current/run/docker.sock","Error":"","Name":"default"}
{"Current":false,"Description":"Docker Desktop","DockerEndpoint":"unix:///other/run/docker.sock","Error":"","Name":"desktop-linux"}`;

vi.mock("node:child_process");

describe("resolveDockerHost", () => {
	let mockExecFileSync: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		const childProcess = await import("node:child_process");
		mockExecFileSync = vi.mocked(childProcess.execFileSync);

		mockExecFileSync.mockReturnValue(mockedDockerContextLsOutput);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should return WRANGLER_DOCKER_HOST when set", async () => {
		vi.stubEnv("WRANGLER_DOCKER_HOST", "unix:///foo/wrangler/socket");
		vi.stubEnv("DOCKER_HOST", "unix:///bar/docker/socket");

		const result = await resolveDockerHost("/no/op/docker");
		expect(result).toBe("unix:///foo/wrangler/socket");

		expect(mockExecFileSync).not.toHaveBeenCalled();
	});

	it("should return DOCKER_HOST when WRANGLER_DOCKER_HOST is not set", async () => {
		expect(process.env.WRANGLER_DOCKER_HOST).toBeUndefined();
		vi.stubEnv("DOCKER_HOST", "unix:///bar/docker/socket");

		const result = await resolveDockerHost("/no/op/docker");
		expect(result).toBe("unix:///bar/docker/socket");

		expect(mockExecFileSync).not.toHaveBeenCalled();
	});

	it("should use Docker context when no env vars are set", async () => {
		const result = await resolveDockerHost("/no/op/docker");
		expect(result).toBe("unix:///current/run/docker.sock");
		expect(mockExecFileSync).toHaveBeenCalledWith(
			"/no/op/docker",
			["context", "ls", "--format", "json"],
			{ encoding: 'utf8' }
		);
	});

	it("should fall back to platform default on Unix when context fails", async () => {
		mockExecFileSync.mockImplementation(() => {
			throw new Error("Docker command failed");
		});

		const result = await resolveDockerHost("/no/op/docker");
		expect(result).toBe("unix:///var/run/docker.sock");
	});
});
