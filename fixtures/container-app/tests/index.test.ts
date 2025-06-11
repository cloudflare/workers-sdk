import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

// TODO: we'll want to run this on all OSes but that will require some setup because docker is not installed by default on macos and windows
describe.skipIf(process.platform !== "linux" && process.env.CI === "true")(
	"Containers local dev",
	() => {
		it("starts up container service if containers are in config", async () => {
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0"]
			);
			expect(getOutput()).toContain(`Hello from ContainerController!`);
			await stop?.();
		});

		it("doesn't start up container service if no containers are present", async () => {
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0", "-c=wrangler.no-containers.jsonc"]
			);
			const output = getOutput();
			expect(output).not.toContain("Hello from ContainerController!");
			await stop?.();
		});

		it("doesn't start up container service if enable_containers is set to false via config", async () => {
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				[
					"--port=0",
					"--inspector-port=0",
					"-c=wrangler.enable-containers.jsonc",
				]
			);
			const output = getOutput();
			expect(output).not.toContain("Hello from ContainerController!");
			await stop?.();
		});

		it("doesn't start up container service if --enable-containers is set to false via CLI", async () => {
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0", "--enable-containers=false"]
			);
			expect(getOutput()).not.toContain(`Hello from ContainerController!`);
			await stop?.();
		});

		// TODO: not entirely sure how to make this test work without logging random stuff
		it("gets docker path from env var", async () => {
			vi.stubEnv("WRANGLER_CONTAINERS_DOCKER_PATH", "blah/docker");
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0"]
			);
			expect(getOutput()).toContain("blah/docker");
			await stop?.();
		});
	}
);
