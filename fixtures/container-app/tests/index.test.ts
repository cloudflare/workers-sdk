import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
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
			expect(getOutput()).toContain(`Hello from ContainerService!`);
			await stop?.();
		});

		it("doesn't start up container service if no containers are present", async () => {
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0", "-c=wrangler.no-containers.jsonc"]
			);
			const output = getOutput();
			expect(output).not.toContain("Hello from ContainerService!");
			await stop?.();
		});

		it("doesn't start up container service if ignore_containers is set via config", async () => {
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				[
					"--port=0",
					"--inspector-port=0",
					"-c=wrangler.ignore-containers.jsonc",
				]
			);
			const output = getOutput();
			expect(output).not.toContain("Hello from ContainerService!");
			await stop?.();
		});

		it("doesn't start up container service if ignore_containers is set via CLI", async () => {
			const { stop, getOutput } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0", "--ignore-containers"]
			);
			expect(getOutput()).not.toContain(`Hello from ContainerService!`);
			await stop?.();
		});
	}
);
