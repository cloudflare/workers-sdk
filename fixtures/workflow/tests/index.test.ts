import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it, test, vi } from "vitest";
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

	it("creates a workflow with id", async () => {
		await expect(fetchJson(`http://${ip}:${port}/create?workflowName=test`))
			.resolves.toMatchInlineSnapshot(`
			{
			  "__LOCAL_DEV_STEP_OUTPUTS": [
			    {
			      "output": "First step result",
			    },
			  ],
			  "output": null,
			  "status": "running",
			}
		`);

		await vi.waitFor(
			async () => {
				await expect(fetchJson(`http://${ip}:${port}/status?workflowName=test`))
					.resolves.toMatchInlineSnapshot(`
					{
					  "__LOCAL_DEV_STEP_OUTPUTS": [
					    {
					      "output": "First step result",
					    },
					  ],
					  "output": null,
					  "status": "running",
					}
				`);
			},
			{ timeout: 5000 }
		);
	});

	it("creates a workflow without id", async () => {
		await expect(fetchJson(`http://${ip}:${port}/create`)).resolves
			.toMatchInlineSnapshot(`
			{
			  "__LOCAL_DEV_STEP_OUTPUTS": [
			    {
			      "output": "First step result",
			    },
			  ],
			  "output": null,
			  "status": "running",
			}
		`);
	});

	it("fails getting a workflow without creating it first", async () => {
		await expect(
			fetchJson(`http://${ip}:${port}/status?workflowName=anotherTest`)
		).resolves.toMatchObject({
			message: "instance.not_found",
			name: "Error",
		});
	});

	test("batchCreate should create multiple instances and run them separately", async () => {
		await expect(fetchJson(`http://${ip}:${port}/createBatch`)).resolves
			.toMatchInlineSnapshot(`
			[
			  "batch-1",
			  "batch-2",
			]
		`);

		await Promise.all([
			vi.waitFor(
				async () => {
					await expect(
						fetchJson(`http://${ip}:${port}/status?workflowName=batch-1`)
					).resolves.toStrictEqual({
						status: "complete",
						__LOCAL_DEV_STEP_OUTPUTS: [
							{ output: "First step result" },
							{ output: "Second step result" },
						],
						output: "1",
					});
				},
				{ timeout: 5000 }
			),
			vi.waitFor(
				async () => {
					await expect(
						fetchJson(`http://${ip}:${port}/status?workflowName=batch-2`)
					).resolves.toStrictEqual({
						status: "complete",
						__LOCAL_DEV_STEP_OUTPUTS: [
							{ output: "First step result" },
							{ output: "Second step result" },
						],
						output: "2",
					});
				},
				{ timeout: 5000 }
			),
		]);
	});

	describe("retrying a step", () => {
		test("should retry a step if a generic Error (with a generic error message) is thrown", async () => {
			const name = randomUUID();
			await fetchJson(
				`http://${ip}:${port}/createDemo3?workflowName=${name}&doRetry=true&errorMessage=generic_error_message`
			);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get3?workflowName=${name}`
					);

					expect(result["output"]).toEqual("The step was retried 3 times");
				},
				{ timeout: 1500 }
			);
		});

		test("should retry a step if a generic Error (with an empty error message) is thrown", async () => {
			const name = randomUUID();
			await fetchJson(
				`http://${ip}:${port}/createDemo3?workflowName=${name}&doRetry=true&errorMessage=`
			);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get3?workflowName=${name}`
					);

					expect(result["output"]).toEqual("The step was retried 3 times");
				},
				{ timeout: 1500 }
			);
		});

		test("should not retry a step if a NonRetryableError (with a generic error message) is thrown", async () => {
			const name = randomUUID();
			await fetchJson(
				`http://${ip}:${port}/createDemo3?workflowName=${name}&doRetry=false&errorMessage=generic_error_message"`
			);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get3?workflowName=${name}`
					);

					expect(result["output"]).toEqual("The step was retried 0 times");
				},
				{ timeout: 1500 }
			);
		});

		test("should not retry a step if a NonRetryableError (with an empty error message) is thrown", async () => {
			const name = randomUUID();
			await fetchJson(
				`http://${ip}:${port}/createDemo3?workflowName=${name}&doRetry=false&errorMessage=`
			);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get3?workflowName=${name}`
					);

					expect(result["output"]).toEqual("The step was retried 0 times");
				},
				{ timeout: 1500 }
			);
		});
	});

	test("waitForEvent should work", async () => {
		await fetchJson(`http://${ip}:${port}/createDemo2?workflowName=something`);

		await fetchJson(
			`http://${ip}:${port}/sendEvent?workflowName=something`,
			{ event: true },
			"POST"
		);

		await vi.waitFor(
			async () => {
				await expect(
					fetchJson(`http://${ip}:${port}/get2?workflowName=something`)
				).resolves.toMatchInlineSnapshot(`
					{
					  "__LOCAL_DEV_STEP_OUTPUTS": [
					    {
					      "output": "First step result",
					    },
					    {
					      "event": true,
					    },
					    {
					      "output": "Second step result",
					    },
					  ],
					  "output": {},
					  "status": "complete",
					}
				`);
			},
			{ timeout: 5000 }
		);
	});

	it("should create an instance after immediate redirect", async () => {
		await expect(fetchJson(`http://${ip}:${port}/createWithRedirect`)).resolves
			.toMatchInlineSnapshot(`
			{
			  "__LOCAL_DEV_STEP_OUTPUTS": [
			    {
			      "output": "First step result",
			    },
			  ],
			  "output": null,
			  "status": "running",
			}
		`);
	});

	it("should persist instances across lifetimes", async () => {
		await fetchJson(`http://${ip}:${port}/create?workflowName=something`);

		await stop?.();

		const { port: portChild2, stop: stopChild2Process } = await runWranglerDev(
			resolve(__dirname, ".."),
			[`--port=0`, `--inspector-port=0`]
		);

		try {
			const result = await fetchJson(
				`http://${ip}:${portChild2}/status?workflowName=something`
			);
			expect(result).not.toBeUndefined();
		} finally {
			await stopChild2Process?.();
		}
	});
});
