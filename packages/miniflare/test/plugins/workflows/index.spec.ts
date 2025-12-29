import * as fs from "node:fs/promises";
import { scheduler } from "node:timers/promises";
import { Miniflare, MiniflareOptions } from "miniflare";
import { expect, test } from "vitest";
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

test("persists Workflow data on file-system between runs", async () => {
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
