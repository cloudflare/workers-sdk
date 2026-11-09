import path from "node:path";
import { scheduler } from "node:timers/promises";
import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

// The workflow sleeps for two seconds between two steps, so a reload issued
// after the first step lands in the middle of a persisted sleep.
const WORKFLOW_SCRIPT = `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class MyWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		await step.do("before", async () => "before");
		await step.sleep("sleep", "2 seconds");
		await step.do("after", async () => "after");
		return "done";
	}
}
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const id = url.searchParams.get("id");
		const workflow = ctx.exports.MyWorkflow;
		switch (url.pathname) {
			case "/create":
				return Response.json({ id: (await workflow.create({ id })).id });
			case "/status":
				return Response.json(await (await workflow.get(id)).status());
			default:
				return new Response("not found", { status: 404 });
		}
	},
};`;

const WORKER = {
	config: {
		name: "workflow-reload-worker",
		compatibilityDate: "2026-08-28",
		exports: { MyWorkflow: { type: "workflow", name: "my-workflow" } },
		manifest: singleModuleManifest(WORKFLOW_SCRIPT),
	},
};

async function status(
	mf: Miniflare,
	id: string
): Promise<Record<string, unknown>> {
	const response = await mf.dispatchFetch(`http://localhost/status?id=${id}`);
	const body = await response.text();
	if (!response.ok) {
		throw new Error(`/status failed with ${response.status}: ${body}`);
	}
	return JSON.parse(body);
}

async function waitForStatus(
	mf: Miniflare,
	id: string,
	expected: string,
	timeoutMs = 8_000
): Promise<Record<string, unknown>> {
	const begin = performance.now();
	let last = "";
	while (performance.now() - begin < timeoutMs) {
		const result = await status(mf, id);
		last = JSON.stringify(result);
		if (result.status === expected) {
			return result;
		}
		await scheduler.wait(100);
	}
	throw new Error(
		`Timed out waiting for status "${expected}" of ${id}. Last status: ${last}`
	);
}

describe("Workflows across setOptions() reloads", () => {
	test("completes a persisted sleep after reloading with the same options", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const opts = {
			resourcePersistencePath: path.join(tmp, "persist"),
			workers: [WORKER],
		} satisfies MiniflareOptions;
		const mf = new Miniflare(opts);
		useDispose(mf);

		const id = "reload-sleep";
		const createResponse = await mf.dispatchFetch(
			`http://localhost/create?id=${id}`
		);
		expect(JSON.parse(await createResponse.text())).toEqual({ id });

		// Wait until the instance is parked inside its two-second sleep.
		const running = await waitForStatus(mf, id, "running");
		expect(running.__LOCAL_DEV_STEP_OUTPUTS).toEqual(["before"]);

		// Reload with identical options: the same code and the same
		// persistence directory, only the Worker generation changes.
		await mf.setOptions(opts);

		// The persisted sleep should still complete. The workflow needs at
		// most the remaining sleep time after the reload.
		const result = await waitForStatus(mf, id, "complete", 6_000);
		expect(result.output).toBe("done");
	});

	test("completes the same sleep without a reload", async ({ expect }) => {
		const tmp = await useTmp();
		const opts = {
			resourcePersistencePath: path.join(tmp, "persist"),
			workers: [WORKER],
		} satisfies MiniflareOptions;
		const mf = new Miniflare(opts);
		useDispose(mf);

		const id = "no-reload-sleep";
		const createResponse = await mf.dispatchFetch(
			`http://localhost/create?id=${id}`
		);
		expect(JSON.parse(await createResponse.text())).toEqual({ id });

		// Control for the reload test above: without a reload the same
		// workflow completes once its sleep elapses.
		const result = await waitForStatus(mf, id, "complete", 6_000);
		expect(result.output).toBe("done");
	});
});
