import { Miniflare } from "miniflare";
import { assert, test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const SLEEP_DURATION_MS = 1500;

const WORKFLOW_SCRIPT = `
import { WorkflowEntrypoint } from "cloudflare:workers";

export class SleepWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		await step.sleepUntil("sleep", Date.now() + ${SLEEP_DURATION_MS});
		await step.do("after-sleep", async () => "awake");
		return "finished";
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const id = url.searchParams.get("id");
		if (id !== null) {
			const instance = await env.SLEEP_WORKFLOW.get(id);
			return Response.json(await instance.status());
		}
		const instance = await env.SLEEP_WORKFLOW.create();
		return Response.json({ id: instance.id });
	},
};`;

test("completes a persisted sleep across a setOptions() reload", async () => {
	const tmp = await useTmp();
	const buildOptions = (): MiniflareOptions => ({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					name: "workflow-sleep-reload-worker",
					compatibilityDate: "2026-08-28",
					manifest: singleModuleManifest(WORKFLOW_SCRIPT),
					env: {
						SLEEP_WORKFLOW: {
							type: "workflow",
							name: "SLEEP_WORKFLOW",
							worker: "workflow-sleep-reload-worker",
							exportName: "SleepWorkflow",
						},
					},
				},
			},
		],
	});

	const mf = new Miniflare(buildOptions());
	useDispose(mf);

	// Create an instance and wait until it's inside its sleep
	const res = await mf.dispatchFetch("http://localhost");
	const { id } = (await res.json()) as { id: string };

	const statusResponse = await mf.dispatchFetch(
		`http://localhost/?id=${id}`
	);
	assert.equal(
		((await statusResponse.json()) as { status: string }).status,
		"running"
	);
	await new Promise((resolve) => setTimeout(resolve, 200));

	// Reload the runtime with the same options, as `wrangler dev` does on a
	// file change: workerd is restarted, destroying in-memory DO state, while
	// storage persists to `tmp`
	await mf.setOptions(buildOptions());

	// The instance should resume from storage and complete once its sleep
	// deadline passes; give it a generous margin
	const deadline = Date.now() + SLEEP_DURATION_MS + 5000;
	let status: string | undefined;
	while (Date.now() < deadline) {
		const response = await mf.dispatchFetch(`http://localhost/?id=${id}`);
		status = ((await response.json()) as { status: string }).status;
		if (status === "complete") {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	assert.equal(status, "complete");
});
