import { scheduler } from "node:timers/promises";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const SLEEP_RELOAD_WORKFLOW_SCRIPT = () => `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class SleepReloadWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		await step.do("first step", async () => "before-sleep");
		await step.sleepUntil("nap", new Date(Date.now() + 2000));
		await step.do("after sleep", async () => "after-sleep");
		return "done";
	}
}
export default {
	async fetch(_request, env) {
		// Deterministic ids are unique: create() throws once the instance
		// exists, so later requests read the existing instance instead.
		let workflow;
		try {
			workflow = await env.SLEEP_WORKFLOW.create({id: "sleep-reload"});
		} catch (e) {
			if (!String(e).includes("instance.already_exists")) {
				throw e;
			}
			workflow = await env.SLEEP_WORKFLOW.get("sleep-reload");
		}

		return new Response(JSON.stringify(await workflow.status()))
	},
};`;

type WorkflowStatus = {
	status: string;
	__LOCAL_DEV_STEP_OUTPUTS: unknown[];
	output: string | null;
};

async function fetchStatus(mf: Miniflare): Promise<WorkflowStatus> {
	const res = await mf.dispatchFetch("http://localhost");
	return (await res.json()) as WorkflowStatus;
}

test("completes a persisted sleep that straddles a setOptions() reload", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const opts: MiniflareOptions = {
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					name: "sleep-reload-worker",
					compatibilityDate: "2026-08-28",
					manifest: singleModuleManifest(SLEEP_RELOAD_WORKFLOW_SCRIPT()),
					env: {
						SLEEP_WORKFLOW: {
							type: "workflow",
							name: "SLEEP_WORKFLOW",
							worker: "sleep-reload-worker",
							exportName: "SleepReloadWorkflow",
						},
					},
				},
			},
		],
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	// Start the instance and wait for the first step to complete, so the
	// workflow is parked inside sleepUntil() with its deadline persisted.
	let status: WorkflowStatus | undefined;
	const sleepStart = performance.now();
	while (performance.now() - sleepStart < 5000) {
		status = await fetchStatus(mf);
		if (
			status.__LOCAL_DEV_STEP_OUTPUTS.includes("before-sleep") &&
			status.status === "running"
		) {
			break;
		}
		await scheduler.wait(50);
	}
	expect(status?.status).toBe("running");
	expect(status?.__LOCAL_DEV_STEP_OUTPUTS).toContain("before-sleep");

	// Reload the runtime with the same options and persistence, like a config
	// change in `wrangler dev` does.
	await mf.setOptions(opts);

	// The instance restores as running with its checkpoints intact, so the
	// persisted sleep should complete and the workflow finish (#16794).
	const boundary = 5000;
	const begin = performance.now();
	let last: WorkflowStatus | undefined;
	while (performance.now() - begin < boundary) {
		last = await fetchStatus(mf);
		if (last.status === "complete") {
			break;
		}
		await scheduler.wait(50);
	}
	expect(last?.status, `Instance did not complete in ${boundary}ms`).toBe(
		"complete"
	);
	expect(last?.output).toBe("done");
	expect(last?.__LOCAL_DEV_STEP_OUTPUTS).toContain("after-sleep");
});
