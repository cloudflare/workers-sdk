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
			[
				"--port=0",
				"--inspector-port=0",
				"--upstream-protocol=https",
				"--host=prod.example.org",
			]
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

	it("creates a workflow with id", async ({ expect }) => {
		await expect(
			fetchJson(`http://${ip}:${port}/create?workflowName=test`)
		).resolves.toEqual({
			status: "running",
			output: [],
		});

		await vi.waitFor(
			async () => {
				await expect(
					fetchJson(`http://${ip}:${port}/status?workflowName=test`)
				).resolves.toEqual({
					status: "running",
					output: [{ output: "First step result" }],
				});
			},
			{ timeout: 5000 }
		);

		await vi.waitFor(
			async () => {
				await expect(
					fetchJson(`http://${ip}:${port}/status?workflowName=test`)
				).resolves.toEqual({
					status: "complete",
					output: [
						{ output: "First step result" },
						{ output: "Second step result" },
					],
				});
			},
			{ timeout: 5000 }
		);
	});

	it("creates a workflow without id", async ({ expect }) => {
		await expect(fetchJson(`http://${ip}:${port}/create`)).resolves.toEqual({
			status: "running",
			output: [],
		});
	});
});
