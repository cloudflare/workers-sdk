import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it, test, vi } from "vitest";
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

	async function fetchJson(url: string, body?: unknown, method?: string) {
		const response = await fetch(url, {
			headers: {
				"MF-Disable-Pretty-Error": "1",
			},
			method: method ?? "GET",
			body: body !== undefined ? JSON.stringify(body) : undefined,
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

	describe("instance lifecycle methods (workflow3)", () => {
		test("pause and resume a workflow", async ({ expect }) => {
			const id = randomUUID();

			await fetchJson(`http://${ip}:${port}/create?workflowName=3&id=${id}`);

			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as {
						status: {
							__LOCAL_DEV_STEP_OUTPUTS: { output: string }[];
						};
					};
					expect(result.status.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 5000 }
			);

			// Pause the instance
			await fetchJson(`http://${ip}:${port}/pause?workflowName=3&id=${id}`);

			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as { status: { status: string } };
					expect(result.status.status).toBe("paused");
				},
				{ timeout: 5000 }
			);

			// Resume the instance
			await fetchJson(`http://${ip}:${port}/resume?workflowName=3&id=${id}`);

			await fetchJson(
				`http://${ip}:${port}/sendEvent?workflowName=3&id=${id}`,
				{ done: true },
				"POST"
			);

			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as { status: { status: string; output: string } };
					expect(result.status.status).toBe("complete");
					expect(result.status.output).toBe("i'm workflow3");
				},
				{ timeout: 5000 }
			);
		});

		test("terminate a running workflow", async ({ expect }) => {
			const id = randomUUID();

			await fetchJson(`http://${ip}:${port}/create?workflowName=3&id=${id}`);

			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as {
						status: {
							__LOCAL_DEV_STEP_OUTPUTS: { output: string }[];
						};
					};
					expect(result.status.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 5000 }
			);

			// Terminate
			await fetchJson(`http://${ip}:${port}/terminate?workflowName=3&id=${id}`);

			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as { status: { status: string } };
					expect(result.status.status).toBe("terminated");
				},
				{ timeout: 5000 }
			);
		});

		test("restart a running workflow", async ({ expect }) => {
			const id = randomUUID();

			await fetchJson(`http://${ip}:${port}/create?workflowName=3&id=${id}`);

			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as {
						status: {
							__LOCAL_DEV_STEP_OUTPUTS: { output: string }[];
						};
					};
					expect(result.status.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 5000 }
			);

			// Restart the instance
			await fetchJson(`http://${ip}:${port}/restart?workflowName=3&id=${id}`);

			// After restart, wait for it to be running again
			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as { status: { status: string } };
					expect(result.status.status).toBe("running");
				},
				{ timeout: 5000 }
			);

			// Send event to complete the restarted workflow
			await fetchJson(
				`http://${ip}:${port}/sendEvent?workflowName=3&id=${id}`,
				{ done: true },
				"POST"
			);

			await vi.waitFor(
				async () => {
					const result = (await fetchJson(
						`http://${ip}:${port}/status?workflowName=3&id=${id}`
					)) as { status: { status: string; output: string } };
					expect(result.status.status).toBe("complete");
					expect(result.status.output).toBe("i'm workflow3");
				},
				{ timeout: 5000 }
			);
		});
	});
});
