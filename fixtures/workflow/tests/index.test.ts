import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import { fork } from "node:child_process";
import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it, test, vi } from "vitest";
import {
	runWranglerDev,
	wranglerEntryPath,
} from "../../shared/src/run-wrangler-long-lived";

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

	it("creates a workflow with id", async ({ expect }) => {
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

	it("creates a workflow without id", async ({ expect }) => {
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

	test("batchCreate should create multiple instances and run them separately", async ({
		expect,
	}) => {
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
		test("should retry a step if a generic Error (with a generic error message) is thrown", async ({
			expect,
		}) => {
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

		test("should retry a step if a generic Error (with an empty error message) is thrown", async ({
			expect,
		}) => {
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

		test("should not retry a step if a NonRetryableError (with a generic error message) is thrown", async ({
			expect,
		}) => {
			const name = randomUUID();
			await fetchJson(
				`http://${ip}:${port}/createDemo3?workflowName=${name}&doRetry=false&errorMessage=generic_error_message`
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

		test("should not retry a step if a NonRetryableError (with an empty error message) is thrown", async ({
			expect,
		}) => {
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

	test("waitForEvent should work", async ({ expect }) => {
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

	describe("instance lifecycle methods", () => {
		test("pause and resume a workflow", async ({ expect }) => {
			const name = randomUUID();

			await fetchJson(`http://${ip}:${port}/createDemo2?workflowName=${name}`);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 1500 }
			);

			// Pause the instance
			await fetchJson(`http://${ip}:${port}/pause?workflowName=${name}`);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.status).toBe("paused");
				},
				{ timeout: 1500 }
			);

			// Resume the instance
			await fetchJson(`http://${ip}:${port}/resume?workflowName=${name}`);

			await fetchJson(
				`http://${ip}:${port}/sendEvent?workflowName=${name}`,
				{ event: true },
				"POST"
			);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.status).toBe("complete");
				},
				{ timeout: 5000 }
			);
		});

		test("terminate a running workflow", async ({ expect }) => {
			const name = randomUUID();

			await fetchJson(`http://${ip}:${port}/createDemo2?workflowName=${name}`);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 1500 }
			);

			// Terminate the instance
			await fetchJson(`http://${ip}:${port}/terminate?workflowName=${name}`);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.status).toBe("terminated");
				},
				{ timeout: 1500 }
			);
		});

		test("restart a running workflow", async ({ expect }) => {
			const name = randomUUID();

			await fetchJson(`http://${ip}:${port}/createDemo2?workflowName=${name}`);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 5000 }
			);

			// Restart the instance
			await fetchJson(`http://${ip}:${port}/restart?workflowName=${name}`);

			// After restart, wait for it to be running again
			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.status).toBe("running");
				},
				{ timeout: 1500 }
			);

			// Send event to complete the restarted workflow
			await fetchJson(
				`http://${ip}:${port}/sendEvent?workflowName=${name}`,
				{ event: true },
				"POST"
			);

			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=${name}`
					);
					expect(result.status).toBe("complete");
				},
				{ timeout: 5000 }
			);
		});
	});

	it("should create an instance after immediate redirect", async ({
		expect,
	}) => {
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

	// =========================================================================
	// Local CLI commands (wrangler workflows ... --local --port=<port>)
	// =========================================================================

	/**
	 * Run a short-lived wrangler CLI command and return its combined output.
	 * Merges stdout + stderr into a single `output` string (wrangler routes
	 * log messages across both streams depending on the logger method).
	 */
	function runWranglerCommand(
		args: string[]
	): Promise<{ output: string; exitCode: number | null }> {
		return new Promise((resolve) => {
			const chunks: Buffer[] = [];

			const child = fork(wranglerEntryPath, args, {
				stdio: ["ignore", "pipe", "pipe", "ipc"],
				cwd: __dirname,
			});

			child.stdout?.on("data", (chunk) => chunks.push(chunk));
			child.stderr?.on("data", (chunk) => chunks.push(chunk));

			child.on("exit", (exitCode) => {
				resolve({
					output: Buffer.concat(chunks).toString(),
					exitCode,
				});
			});
		});
	}

	describe("local CLI commands", () => {
		it("workflows list --local", async ({ expect }) => {
			const result = await runWranglerCommand([
				"workflows",
				"list",
				"--local",
				`--port=${port}`,
			]);

			expect(result.exitCode).toBe(0);
			expect(result.output).toContain(
				"Showing 3 workflows from local dev session:"
			);
			expect(result.output).toContain("my-workflow");
			expect(result.output).toContain("my-workflow2");
			expect(result.output).toContain("my-workflow3");
			expect(result.output).toContain("my-workflow-demo");
			expect(result.output).toContain("Demo");
			expect(result.output).toContain("Demo2");
			expect(result.output).toContain("Demo3");
		});

		it("workflows describe --local", async ({ expect }) => {
			const result = await runWranglerCommand([
				"workflows",
				"describe",
				"my-workflow",
				"--local",
				`--port=${port}`,
			]);

			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("my-workflow");
			expect(result.output).toContain("my-workflow-demo");
			expect(result.output).toContain("Demo");
			expect(result.output).toContain("Instance Status Counts:");
		});

		it("workflows trigger --local and instances list --local", async ({
			expect,
		}) => {
			const result = await runWranglerCommand([
				"workflows",
				"trigger",
				"my-workflow",
				"--local",
				`--port=${port}`,
			]);

			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("has been triggered successfully");

			// Wait for the instance to register
			await vi.waitFor(
				async () => {
					const listResult = await runWranglerCommand([
						"workflows",
						"instances",
						"list",
						"my-workflow",
						"--local",
						`--port=${port}`,
					]);

					expect(listResult.exitCode).toBe(0);
					expect(listResult.output).toContain("from page 1:");
				},
				{ timeout: 5000 }
			);
		});

		it("workflows instances describe --local", async ({ expect }) => {
			// Trigger an instance first
			const triggerResult = await runWranglerCommand([
				"workflows",
				"trigger",
				"my-workflow",
				"--local",
				`--port=${port}`,
			]);
			expect(triggerResult.exitCode).toBe(0);

			// Describe latest
			await vi.waitFor(
				async () => {
					const result = await runWranglerCommand([
						"workflows",
						"instances",
						"describe",
						"my-workflow",
						"latest",
						"--local",
						`--port=${port}`,
					]);

					expect(result.exitCode).toBe(0);
					expect(result.output).toContain("Describing latest instance:");
					expect(result.output).toContain("my-workflow");
					expect(result.output).toContain("Steps:");
				},
				{ timeout: 5000 }
			);
		});

		it("workflows instances pause and resume --local", async ({ expect }) => {
			// Create a Demo2 instance (has waitForEvent so it stays running)
			await fetchJson(
				`http://${ip}:${port}/createDemo2?workflowName=pause-resume-test`
			);

			// Wait for it to be running
			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=pause-resume-test`
					);
					expect(result.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 5000 }
			);

			// Pause via CLI
			const pauseResult = await runWranglerCommand([
				"workflows",
				"instances",
				"pause",
				"my-workflow2",
				"pause-resume-test",
				"--local",
				`--port=${port}`,
			]);
			expect(pauseResult.exitCode).toBe(0);
			expect(pauseResult.output).toContain(
				'The instance "pause-resume-test" from my-workflow2 was paused successfully'
			);

			// Verify paused via binding
			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=pause-resume-test`
					);
					expect(result.status).toBe("paused");
				},
				{ timeout: 5000 }
			);

			// Resume via CLI
			const resumeResult = await runWranglerCommand([
				"workflows",
				"instances",
				"resume",
				"my-workflow2",
				"pause-resume-test",
				"--local",
				`--port=${port}`,
			]);
			expect(resumeResult.exitCode).toBe(0);
			expect(resumeResult.output).toContain(
				'The instance "pause-resume-test" from my-workflow2 was resumed successfully'
			);
		});

		it("workflows instances terminate --local", async ({ expect }) => {
			// Create a Demo2 instance (has waitForEvent so it stays running)
			await fetchJson(
				`http://${ip}:${port}/createDemo2?workflowName=terminate-test`
			);

			// Wait for it to be running
			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=terminate-test`
					);
					expect(result.__LOCAL_DEV_STEP_OUTPUTS).toContainEqual({
						output: "First step result",
					});
				},
				{ timeout: 5000 }
			);

			// Terminate via CLI
			const terminateResult = await runWranglerCommand([
				"workflows",
				"instances",
				"terminate",
				"my-workflow2",
				"terminate-test",
				"--local",
				`--port=${port}`,
			]);
			expect(terminateResult.exitCode).toBe(0);
			expect(terminateResult.output).toContain(
				'The instance "terminate-test" from my-workflow2 was terminated successfully'
			);

			// Verify terminated via binding
			await vi.waitFor(
				async () => {
					const result = await fetchJson(
						`http://${ip}:${port}/get2?workflowName=terminate-test`
					);
					expect(result.status).toBe("terminated");
				},
				{ timeout: 5000 }
			);
		});

		it("workflows delete --local", async ({ expect }) => {
			const result = await runWranglerCommand([
				"workflows",
				"delete",
				"my-workflow3",
				"--local",
				`--port=${port}`,
			]);

			expect(result.exitCode).toBe(0);
			expect(result.output).toContain(
				'Workflow "my-workflow3" instances removed successfully from local dev session.'
			);
		});
	});

	it("should persist instances across lifetimes", async ({ expect }) => {
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
