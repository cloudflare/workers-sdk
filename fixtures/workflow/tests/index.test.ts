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
});
