import { ChildProcess, execSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe
	.skipIf(process.platform !== "linux" && process.env.CI === "true")
	.sequential.each([
		{ source: "dockerfile (built)", config: "wrangler.jsonc" },
		{
			source: "registry uri (pulled)",
			config: "wrangler.registry.jsonc",
		},
	])(
	"container local dev with image from $source",
	{ timeout: 90000 },
	(testCase) => {
		let ip: string,
			port: number,
			stop: (() => Promise<unknown>) | undefined,
			wranglerProcess: ChildProcess;

		beforeAll(async () => {
			({ ip, port, stop, wranglerProcess } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0", `-c=${testCase.config}`]
			));
			// cleanup any running containers
			const ids = getContainerIds();
			if (ids.length > 0) {
				execSync("docker rm -f " + ids.join(" "), {
					encoding: "utf8",
				});
			}
		});

		afterAll(async () => {
			await stop?.();
			// cleanup any containers that were started during the tests
			const ids = getContainerIds();
			if (ids.length > 0) {
				execSync("docker rm -f " + ids.join(" "), {
					encoding: "utf8",
				});
			}
		});

		it("should check initial container status (not running)", async () => {
			const response = await fetch(`http://${ip}:${port}/status`);
			const status = await response.json();
			expect(response.status).toBe(200);
			expect(status).toBe(false);
		});

		it("should start a container and be able to make requests to it", async () => {
			let response = await fetch(`http://${ip}:${port}/start`);
			let text = await response.text();
			expect(response.status).toBe(200);
			expect(text).toBe("Container create request sent...");

			// Wait a bit for container to start
			await new Promise((resolve) => setTimeout(resolve, 2000));

			response = await fetch(`http://${ip}:${port}/status`);
			const status = await response.json();
			expect(response.status).toBe(200);
			expect(status).toBe(true);

			response = await fetch(`http://${ip}:${port}/fetch`);
			expect(response.status).toBe(200);
			text = await response.text();
			expect(text).toBe("Hello World! Have an env var! I'm an env var!");
			// Check that a container is running using `docker ps`
			const ids = getContainerIds();
			expect(ids.length).toBe(1);
		});

		it("should clean up any containers that were started", async () => {
			// we want to give wrangler a chance to clean up, rather than using treekill
			wranglerProcess.kill("SIGINT");
			await new Promise<void>((resolve) => {
				wranglerProcess.once("exit", () => resolve());
			});
			vi.waitFor(() => {
				const remainingIds = getContainerIds();
				expect(remainingIds.length).toBe(0);
			});
		});
	}
);

const getContainerIds = () => {
	// note the -a to include stopped containers
	const ids = execSync("docker ps -a -q");
	return ids
		.toString()
		.trim()
		.split("\n")
		.filter((id) => id.trim() !== "");
};
