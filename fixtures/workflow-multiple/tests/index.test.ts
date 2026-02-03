import { rm } from "fs/promises";
import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("Workflows", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		// delete previous run contents because of persistence
		await rm(resolve(__dirname, "..") + "/.wrangler", {
			force: true,
			recursive: true,
		});
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	async function fetchJson(url: string) {
		const response = await fetch(url, {
			headers: {
				"MF-Disable-Pretty-Error": "1",
			},
		});
		const text = await response.text();

		try {
			return JSON.parse(text);
		} catch (err) {
			throw new Error(`Couldn't parse JSON:\n\n${text}`);
		}
	}

	it("creates two instances with same id in two different workflows", async ({
		expect,
	}) => {
		// Create both workflow instances
		// Note: We don't assert the intermediate "running" status because the workflow
		// may complete before we can observe it, causing flaky tests on fast CI machines
		await Promise.all([
			fetchJson(`http://${ip}:${port}/create?workflowName=1&id=test`),
			fetchJson(`http://${ip}:${port}/create?workflowName=2&id=test`),
		]);

		// Wait for both workflows to complete with their final outputs
		await Promise.all([
			vi.waitFor(
				async () => {
					await expect(
						fetchJson(`http://${ip}:${port}/status?workflowName=1&id=test`)
					).resolves.toStrictEqual({
						id: "test",
						status: {
							status: "complete",
							__LOCAL_DEV_STEP_OUTPUTS: [
								{ output: "First step result" },
								{ output: "workflow1" },
							],
							output: "i'm workflow1",
						},
					});
				},
				{ timeout: 10000 }
			),
			vi.waitFor(
				async () => {
					await expect(
						fetchJson(`http://${ip}:${port}/status?workflowName=2&id=test`)
					).resolves.toStrictEqual({
						id: "test",
						status: {
							status: "complete",
							__LOCAL_DEV_STEP_OUTPUTS: [
								{ output: "First step result" },
								{ output: "workflow2" },
							],
							output: "i'm workflow2",
						},
					});
				},
				{ timeout: 10000 }
			),
		]);
	});
});
