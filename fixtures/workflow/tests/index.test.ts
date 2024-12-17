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

	it("creates a workflow with id", async ({ expect }) => {
		await expect(
			fetchJson(`http://${ip}:${port}/create?workflowName=test`)
		).resolves.toEqual({
			status: "running",
			__LOCAL_DEV_STEP_OUTPUTS: [],
			output: null,
		});

		await vi.waitFor(
			async () => {
				await expect(
					fetchJson(`http://${ip}:${port}/status?workflowName=test`)
				).resolves.toEqual({
					status: "running",
					__LOCAL_DEV_STEP_OUTPUTS: [{ output: "First step result" }],
					output: null,
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
					__LOCAL_DEV_STEP_OUTPUTS: [
						{ output: "First step result" },
						{ output: "Second step result" },
					],
					output: "i'm a workflow output",
				});
			},
			{ timeout: 5000 }
		);
	});

	it("creates a workflow without id", async ({ expect }) => {
		await expect(fetchJson(`http://${ip}:${port}/create`)).resolves.toEqual({
			status: "running",
			__LOCAL_DEV_STEP_OUTPUTS: [],
			output: null,
		});
	});

	it("fails getting a workflow without creating it first", async ({
		expect,
	}) => {
		await expect(
			fetchJson(`http://${ip}:${port}/status?workflowName=anotherTest`)
		).resolves.toMatchObject({
			message: "instance.not_found",
			name: "Error",
		});
	});
});
