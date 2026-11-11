import { readdirSync, readFileSync } from "node:fs";
import { scheduler } from "node:timers/promises";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";

const INSTANCES = 150;

function workerdOpenFiles(): number {
	const pids = readdirSync("/proc").filter((entry) => {
		if (!/^\d+$/.test(entry)) return false;
		try {
			const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
			const ppid = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1];
			return ppid === String(process.pid);
		} catch {
			return false;
		}
	});
	let max = 0;
	for (const pid of pids) {
		try {
			max = Math.max(max, readdirSync(`/proc/${pid}/fd`).length);
		} catch {}
	}
	return max;
}

// https://github.com/cloudflare/workers-sdk/issues/15809
test.skipIf(process.platform !== "linux")(
	"completed Workflow instances release file handles once idle",
	{ timeout: 180_000 },
	async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			resourcePersistencePath: tmp,
			workers: [
				{
					config: {
						name: "workflow-fd-worker",
						compatibilityDate: "2026-08-28",
						manifest: singleModuleManifest(`
							import { WorkflowEntrypoint } from "cloudflare:workers";
							export class FdWorkflow extends WorkflowEntrypoint {
								async run(event, step) {
									await step.do("step", async () => "ok");
									return "done";
								}
							}
							export default {
								async fetch(request, env) {
									const ids = [];
									for (let i = 0; i < ${INSTANCES}; i++) {
										const instance = await env.FD_WORKFLOW.create({ id: "fd-" + i });
										ids.push(instance.id);
									}
									for (const id of ids) {
										const instance = await env.FD_WORKFLOW.get(id);
										while ((await instance.status()).status !== "complete") {
											await scheduler.wait(50);
										}
									}
									return new Response("ok");
								},
							};
						`),
						env: {
							FD_WORKFLOW: {
								type: "workflow",
								name: "FD_WORKFLOW",
								worker: "workflow-fd-worker",
								exportName: "FdWorkflow",
							},
						},
					},
				},
			],
		});
		useDispose(mf);
		await mf.ready;
		const baseline = workerdOpenFiles();
		const res = await mf.dispatchFetch("http://localhost");
		expect(await res.text()).toBe("ok");

		// Allow idle engines time to be evicted
		let open = workerdOpenFiles();
		for (let i = 0; i < 60 && open > baseline + 50; i++) {
			await scheduler.wait(1000);
			open = workerdOpenFiles();
		}
		// Retained handles scale with the number of completed instances
		expect(open - baseline).toBeLessThan(INSTANCES);
	}
);
