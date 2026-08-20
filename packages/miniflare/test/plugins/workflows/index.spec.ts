import * as fs from "node:fs/promises";
import path from "node:path";
import { scheduler } from "node:timers/promises";
import { Miniflare, WORKFLOWS_PLUGIN_NAME } from "miniflare";
import { describe, test, vi } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const WORKFLOW_SCRIPT = () => `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class MyWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		await step.do("i'm a step?", async () => "yes you are")

		return "I'm a output string"
	}
  }
  export default {
	async fetch(request, env, ctx) {
		const workflow = await env.MY_WORKFLOW.create({id: "an-id"})

		return new Response(JSON.stringify(await workflow.status()))
	},
  };`;

test("starts Workflows with user-provided experimental compatibility flag", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					type: "worker",
					name: "workflow-compatibility-flags-worker",
					compatibilityDate: "2024-11-20",
					compatibilityFlags: [
						"nodejs_compat",
						"experimental",
						"enhanced_error_serialization",
					],
					manifest: singleModuleManifest(WORKFLOW_SCRIPT()),
					env: {
						MY_WORKFLOW: {
							type: "workflow",
							name: "MY_WORKFLOW",
							workerName: "workflow-compatibility-flags-worker",
							exportName: "MyWorkflow",
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe(
		'{"status":"complete","__LOCAL_DEV_STEP_OUTPUTS":["yes you are"],"output":"I\'m a output string"}'
	);
});

test("persists Workflow data on file-system between runs", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const opts: MiniflareOptions = {
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					type: "worker",
					name: "worker",
					compatibilityDate: "2024-11-20",
					manifest: singleModuleManifest(WORKFLOW_SCRIPT()),
					env: {
						MY_WORKFLOW: {
							type: "workflow",
							name: "MY_WORKFLOW",
							workerName: "worker",
							exportName: "MyWorkflow",
						},
					},
				},
			},
		],
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe(
		'{"status":"complete","__LOCAL_DEV_STEP_OUTPUTS":["yes you are"],"output":"I\'m a output string"}'
	);

	// there's no waitUntil in ava haha
	const begin = performance.now();
	let success = false;
	let test = "";
	while (performance.now() - begin < 2000) {
		const res = await mf.dispatchFetch("http://localhost");
		test = await res.text();
		if (
			test ===
			'{"status":"complete","__LOCAL_DEV_STEP_OUTPUTS":["yes you are"],"output":"I\'m a output string"}'
		) {
			success = true;
			break;
		}
		await scheduler.wait(50);
	}
	expect(success, `Condition was not met in 2000ms - output is ${test}`).toBe(
		true
	);

	// check if files were committed under the plugin subdirectory
	const names = await fs.readdir(path.join(tmp, WORKFLOWS_PLUGIN_NAME));
	expect(names).toEqual(["miniflare-workflows-MY_WORKFLOW"]);

	// restart miniflare
	await mf.dispose();
	const mf2 = new Miniflare(opts);
	useDispose(mf2);

	// state should be persisted now
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe(
		'{"status":"complete","__LOCAL_DEV_STEP_OUTPUTS":["yes you are"],"output":"I\'m a output string"}'
	);
});

const LIFECYCLE_WORKFLOW_SCRIPT = () => `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class LifecycleWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		if (event.payload?.selfDelete) {
			await step.waitForEvent("self-delete", { type: "self-delete" });
			const instance = await this.env.LIFECYCLE_WORKFLOW.get(event.instanceId);
			await instance.delete();
			throw new Error("continued after self-delete");
		}

		const first = await step.do("first step", async () => "step-1-done");

		await step.do("long step", async () => {
			await scheduler.wait(500);
			return "long-step-done";
		});

		const second = await step.do("third step", async () => "step-3-done");

		return "workflow-complete";
	}
}
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const id = url.searchParams.get("id") || "lifecycle-test";

		if (url.pathname === "/create" || url.pathname === "/selfDelete") {
			const instance = await env.LIFECYCLE_WORKFLOW.create({
				id,
				params: { selfDelete: url.pathname === "/selfDelete" },
			});
			const status = await instance.status();
			return Response.json({ id: instance.id, status });
		}

		if (url.pathname === "/status") {
			const instance = await env.LIFECYCLE_WORKFLOW.get(id);
			return Response.json(await instance.status());
		}

	if (url.pathname === "/pause") {
		const instance = await env.LIFECYCLE_WORKFLOW.get(id);
		await instance.pause();
		return Response.json(await instance.status());
	}

	if (url.pathname === "/resume") {
		const instance = await env.LIFECYCLE_WORKFLOW.get(id);
		await instance.resume();
		return Response.json(await instance.status());
	}

	if (url.pathname === "/restart") {
		const instance = await env.LIFECYCLE_WORKFLOW.get(id);
		await instance.restart();
		return Response.json(await instance.status());
	}

	if (url.pathname === "/terminate") {
		const instance = await env.LIFECYCLE_WORKFLOW.get(id);
		await instance.terminate();
		return Response.json(await instance.status());
	}

	if (url.pathname === "/delete") {
		const instance = await env.LIFECYCLE_WORKFLOW.get(id);
		await instance.delete();
		return Response.json({ ok: true });
	}

	if (url.pathname === "/deleteBatch") {
		return Response.json(
			await env.LIFECYCLE_WORKFLOW.deleteBatch(url.searchParams.getAll("id"))
		);
	}

		if (url.pathname === "/sendEvent") {
			const instance = await env.LIFECYCLE_WORKFLOW.get(id);
			await instance.sendEvent({
				type: url.searchParams.get("type") || "continue",
				payload: { sent: true },
			});
			return Response.json({ ok: true });
		}

		return new Response("Not found", { status: 404 });
	},
};`;

function lifecycleMiniflareOpts(tmp: string): MiniflareOptions {
	return {
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					type: "worker",
					name: "lifecycle-worker",
					compatibilityDate: "2026-03-09",
					manifest: singleModuleManifest(LIFECYCLE_WORKFLOW_SCRIPT()),
					env: {
						LIFECYCLE_WORKFLOW: {
							type: "workflow",
							name: "LIFECYCLE_WORKFLOW",
							workerName: "lifecycle-worker",
							exportName: "LifecycleWorkflow",
						},
					},
				},
			},
		],
	};
}

async function getPersistedInstanceFiles(tmp: string): Promise<string[]> {
	try {
		const files = await fs.readdir(
			path.join(
				tmp,
				WORKFLOWS_PLUGIN_NAME,
				"miniflare-workflows-LIFECYCLE_WORKFLOW"
			)
		);
		return files.filter(
			(file) => file.endsWith(".sqlite") && file !== "metadata.sqlite"
		);
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return [];
		}
		throw error;
	}
}

async function waitForStatus(
	mf: Miniflare,
	id: string,
	expectedStatus: string,
	timeoutMs = 5000
): Promise<Record<string, unknown>> {
	const begin = performance.now();
	let lastResult: Record<string, unknown> = {};
	while (performance.now() - begin < timeoutMs) {
		const res = await mf.dispatchFetch(`http://localhost/status?id=${id}`);
		lastResult = (await res.json()) as Record<string, unknown>;
		if (lastResult.status === expectedStatus) {
			return lastResult;
		}
		await scheduler.wait(100);
	}
	throw new Error(
		`Timed out waiting for status "${expectedStatus}" after ${timeoutMs}ms. Last status: ${JSON.stringify(lastResult)}`
	);
}

async function waitForStepOutput(
	mf: Miniflare,
	id: string,
	expectedOutput: string,
	timeoutMs = 5000
): Promise<void> {
	const begin = performance.now();
	while (performance.now() - begin < timeoutMs) {
		const res = await mf.dispatchFetch(`http://localhost/status?id=${id}`);
		const data = (await res.json()) as {
			__LOCAL_DEV_STEP_OUTPUTS?: string[];
		};
		if (
			data.__LOCAL_DEV_STEP_OUTPUTS &&
			data.__LOCAL_DEV_STEP_OUTPUTS.includes(expectedOutput)
		) {
			return;
		}
		await scheduler.wait(100);
	}
	throw new Error(
		`Timed out waiting for step output "${expectedOutput}" after ${timeoutMs}ms`
	);
}

describe("workflow instance lifecycle methods", () => {
	test("pause and resume a running workflow", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare(lifecycleMiniflareOpts(tmp));
		useDispose(mf);

		const createRes = await mf.dispatchFetch(
			"http://localhost/create?id=pause-resume-test"
		);
		const createData = (await createRes.json()) as Record<string, unknown>;
		expect(createData.id).toBe("pause-resume-test");

		await waitForStepOutput(mf, "pause-resume-test", "step-1-done");

		// Pause the instance — waits for the in-flight long step to finish, then pauses
		const pauseRes = await mf.dispatchFetch(
			"http://localhost/pause?id=pause-resume-test"
		);
		const pauseData = (await pauseRes.json()) as Record<string, unknown>;
		expect(pauseData).toHaveProperty("status");

		await waitForStatus(mf, "pause-resume-test", "paused");

		// Resume the instance
		const resumeRes = await mf.dispatchFetch(
			"http://localhost/resume?id=pause-resume-test"
		);
		const resumeData = (await resumeRes.json()) as Record<string, unknown>;
		expect(resumeData).toHaveProperty("status");

		// After resume, the workflow should complete (third step runs, then returns)
		const finalStatus = await waitForStatus(
			mf,
			"pause-resume-test",
			"complete"
		);
		expect(finalStatus.output).toBe("workflow-complete");
	});

	test("terminate a running workflow", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare(lifecycleMiniflareOpts(tmp));
		useDispose(mf);

		const createRes = await mf.dispatchFetch(
			"http://localhost/create?id=terminate-test"
		);
		await createRes.text(); // consume the body

		await waitForStepOutput(mf, "terminate-test", "step-1-done");

		// Terminate the instance
		const terminateRes = await mf.dispatchFetch(
			"http://localhost/terminate?id=terminate-test"
		);
		const terminateData = (await terminateRes.json()) as Record<
			string,
			unknown
		>;
		expect(terminateData).toHaveProperty("status");

		await waitForStatus(mf, "terminate-test", "terminated");
	});

	test("delete a workflow", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare(lifecycleMiniflareOpts(tmp));
		useDispose(mf);

		const createResponse = await mf.dispatchFetch(
			"http://localhost/create?id=delete-one"
		);
		await createResponse.text();

		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(1);
		const deleteResponse = await mf.dispatchFetch(
			"http://localhost/delete?id=delete-one"
		);
		expect(await deleteResponse.json()).toEqual({ ok: true });
		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(0);

		const statusResponse = await mf.dispatchFetch(
			"http://localhost/status?id=delete-one"
		);
		expect(statusResponse.status).toBe(500);
		expect(await statusResponse.text()).toContain("instance.not_found");

		const cronId = "*/30 * * * *-1786001400000";
		const cronDeleteResponse = await mf.dispatchFetch(
			`http://localhost/delete?id=${encodeURIComponent(cronId)}`
		);
		expect(cronDeleteResponse.status).toBe(500);
		expect(await cronDeleteResponse.text()).toContain("instance.not_found");
	});

	test("reports overlapping storage deletion as successful", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const createResponse = await mf.dispatchFetch(
			"http://localhost/create?id=overlapping-delete"
		);
		await createResponse.text();

		const bindingDelete = mf
			.dispatchFetch("http://localhost/delete?id=overlapping-delete")
			.then((response) => response.json());
		await scheduler.wait(25);
		const explorerDelete = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/workflows/LIFECYCLE_WORKFLOW/instances/overlapping-delete`,
			{ method: "DELETE" }
		);
		expect(explorerDelete.status).toBe(200);
		await explorerDelete.text();
		expect(await bindingDelete).toEqual({ ok: true });
	});

	test("continues deleting storage files after an unlink error", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const hexId = "a".repeat(64);
		const instancePath = path.join(
			tmp,
			WORKFLOWS_PLUGIN_NAME,
			"miniflare-workflows-LIFECYCLE_WORKFLOW",
			hexId
		);
		await fs.mkdir(path.dirname(instancePath), { recursive: true });
		await fs.writeFile(`${instancePath}.sqlite`, "");
		await fs.mkdir(`${instancePath}.sqlite-shm`);
		await fs.writeFile(`${instancePath}.sqlite-wal`, "");

		const response = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/workflows/LIFECYCLE_WORKFLOW/instances/${hexId}`,
			{ method: "DELETE" }
		);
		const body = await response.text();
		expect(response.status, body).toBe(500);
		await expect(fs.stat(`${instancePath}.sqlite`)).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(fs.stat(`${instancePath}.sqlite-wal`)).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect((await fs.stat(`${instancePath}.sqlite-shm`)).isDirectory()).toBe(
			true
		);
	});

	test("recreates a workflow immediately after deletion", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare(lifecycleMiniflareOpts(tmp));
		useDispose(mf);

		let response = await mf.dispatchFetch(
			"http://localhost/create?id=delete-recreate"
		);
		await response.text();
		await waitForStatus(mf, "delete-recreate", "complete");
		response = await mf.dispatchFetch(
			"http://localhost/delete?id=delete-recreate"
		);
		await response.text();
		response = await mf.dispatchFetch(
			"http://localhost/create?id=delete-recreate"
		);
		await response.text();

		await waitForStatus(mf, "delete-recreate", "complete");
		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(1);
	});

	test("delete a workflow from its own execution", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare(lifecycleMiniflareOpts(tmp));
		useDispose(mf);

		const createResponse = await mf.dispatchFetch(
			"http://localhost/selfDelete?id=self-delete"
		);
		await createResponse.text();
		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(1);

		const eventResponse = await mf.dispatchFetch(
			"http://localhost/sendEvent?id=self-delete&type=self-delete"
		);
		await eventResponse.text();
		await vi.waitUntil(
			async () => (await getPersistedInstanceFiles(tmp)).length === 0,
			{ timeout: 5000 }
		);

		const statusResponse = await mf.dispatchFetch(
			"http://localhost/status?id=self-delete"
		);
		expect(statusResponse.status).toBe(500);
		expect(await statusResponse.text()).toContain("instance.not_found");
	});

	test("delete multiple workflows", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);
		const cronId = "*/30 * * * *-1786001400000";

		for (const id of ["delete-1", "delete-2"]) {
			const response = await mf.dispatchFetch(
				`http://localhost/create?id=${id}`
			);
			await response.text();
		}

		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(2);
		const response = await mf.dispatchFetch(
			`http://localhost/deleteBatch?id=delete-1&id=${encodeURIComponent(cronId)}&id=delete-2&id=delete-1`
		);
		expect(await response.json()).toEqual({
			deleted: [{ id: "delete-1" }, { id: "delete-2" }, { id: "delete-1" }],
			errors: [
				{
					id: cronId,
					code: 10400,
					message: "workflows.api.error.instance.not_found",
				},
			],
		});

		const explorerResponse = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/workflows/LIFECYCLE_WORKFLOW/instances/batch/delete`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ instances: [cronId] }),
			}
		);
		expect(explorerResponse.status).toBe(200);
		await explorerResponse.text();
		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(0);

		for (const id of ["delete-1", "delete-2"]) {
			const statusResponse = await mf.dispatchFetch(
				`http://localhost/status?id=${id}`
			);
			expect(statusResponse.status).toBe(500);
			await statusResponse.text();
		}
	});

	test("restart a running workflow", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare(lifecycleMiniflareOpts(tmp));
		useDispose(mf);

		const createRes = await mf.dispatchFetch(
			"http://localhost/create?id=restart-test"
		);
		await createRes.text(); // consume the body

		await waitForStepOutput(mf, "restart-test", "step-1-done");

		// Restart the instance
		const restartRes = await mf.dispatchFetch(
			"http://localhost/restart?id=restart-test"
		);
		const restartData = (await restartRes.json()) as Record<string, unknown>;
		expect(restartData).toHaveProperty("status");

		// After restart, the workflow restarts from scratch and runs to completion
		const finalStatus = await waitForStatus(mf, "restart-test", "complete");
		expect(finalStatus.output).toBe("workflow-complete");
	});
});
