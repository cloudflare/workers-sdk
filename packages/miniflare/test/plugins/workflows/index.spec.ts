import * as fs from "node:fs/promises";
import { scheduler } from "node:timers/promises";
import { Miniflare, MiniflareOptions } from "miniflare";
import { describe, test } from "vitest";
import { useDispose, useTmp } from "../../test-shared";

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

test("persists Workflow data on file-system between runs", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: WORKFLOW_SCRIPT(),
		workflows: {
			MY_WORKFLOW: {
				className: "MyWorkflow",
				name: "MY_WORKFLOW",
			},
		},
		workflowsPersist: tmp,
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

	// check if files were committed
	const names = await fs.readdir(tmp);
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

		if (url.pathname === "/create") {
			const instance = await env.LIFECYCLE_WORKFLOW.create({ id });
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

		if (url.pathname === "/sendEvent") {
			const instance = await env.LIFECYCLE_WORKFLOW.get(id);
			await instance.sendEvent({ type: "continue", payload: { sent: true } });
			return Response.json({ ok: true });
		}

		return new Response("Not found", { status: 404 });
	},
};`;

function lifecycleMiniflareOpts(tmp: string): MiniflareOptions {
	return {
		name: "lifecycle-worker",
		compatibilityDate: "2026-03-09",
		modules: true,
		script: LIFECYCLE_WORKFLOW_SCRIPT(),
		workflows: {
			LIFECYCLE_WORKFLOW: {
				className: "LifecycleWorkflow",
				name: "LIFECYCLE_WORKFLOW",
			},
		},
		workflowsPersist: tmp,
	};
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
