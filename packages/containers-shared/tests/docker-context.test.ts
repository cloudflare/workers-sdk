import { execFileSync } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";
import { afterEach, describe, it, vi } from "vitest";
import { resolveDockerHost } from "../src/utils";

vi.mock("node:child_process");
// We can only really run these tests on Linux, because we build our images for linux/amd64,
// and github runners don't really support container virtualization in any sane way
describe.skipIf(process.platform !== "linux" && process.env.CI === "true")(
	"resolveDockerHost",
	() => {
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		it("should return WRANGLER_DOCKER_HOST when set", async ({ expect }) => {
			vi.stubEnv(
				"WRANGLER_DOCKER_HOST",
				"unix:///FROM/WRANGLER/DOCKER/HOST/wrangler/socket"
			);
			vi.stubEnv("DOCKER_HOST", "unix:///FROM/DOCKER/HOST/docker/socket");

			const result = resolveDockerHost("/no/op/docker");
			expect(result).toBe("unix:///FROM/WRANGLER/DOCKER/HOST/wrangler/socket");
		});

		it("should return DOCKER_HOST when WRANGLER_DOCKER_HOST is not set", async ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_DOCKER_HOST", undefined);
			vi.stubEnv("DOCKER_HOST", "unix:///FROM/DOCKER/HOST/docker/socket");

			const result = resolveDockerHost("/no/op/docker");
			expect(result).toBe("unix:///FROM/DOCKER/HOST/docker/socket");
		});

		it("should use Docker context when no env vars are set", async ({
			expect,
		}) => {
			vi.mocked(execFileSync)
				.mockReturnValue(`{"Current":true,"Description":"Current DOCKER_HOST based configuration","DockerEndpoint":"unix:///FROM/CURRENT/CONTEXT/run/docker.sock","Error":"","Name":"default"}
{"Current":false,"Description":"Docker Desktop","DockerEndpoint":"unix:///FROM/OTHER/CONTEXT/run/docker.sock","Error":"","Name":"desktop-linux"}`);
			const result = resolveDockerHost("/no/op/docker");
			expect(result).toBe("unix:///FROM/CURRENT/CONTEXT/run/docker.sock");
		});

		it("should fall back to platform default when context fails", ({
			expect,
		}) => {
			vi.mocked(execFileSync).mockImplementation(() => {
				throw new UserError("Docker command failed");
			});

			const result = resolveDockerHost("/no/op/docker");
			expect(result).toBe("unix:///var/run/docker.sock");
		});
	}
);
