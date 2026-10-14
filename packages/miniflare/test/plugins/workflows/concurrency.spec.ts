import { Miniflare } from "miniflare";
import { describe, test, vi } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const KEYED_WORKFLOW = `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class KeyedWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		return await step.do("work", { concurrency: "shared" }, async () => "done");
	}
}`;

// Worker B only creates and reads instances of its own Workflow, so the waiting step
// below can only see Worker A's hold through the keys the two Workers share.
const WORKER_B_SCRIPT = `${KEYED_WORKFLOW}
export default {
	async fetch(request, env) {
		const id = new URL(request.url).searchParams.get("id");
		if (request.method === "POST") {
			await env.WORKFLOW_B.create({ id });
			return new Response("created");
		}
		const instance = await env.WORKFLOW_B.get(id);
		return Response.json(await instance.status());
	},
};`;

const WORKER_A_SCRIPT = `${KEYED_WORKFLOW}
async function waitForStatus(env, id, status) {
	for (let i = 0; i < 100; i++) {
		const res = await env.WORKER_B.fetch("http://b/?id=" + id);
		const body = await res.json();
		if (body.status === status) {
			return body;
		}
		await scheduler.wait(50);
	}
	throw new Error("instance " + id + " never reached " + status);
}

export default {
	async fetch(request, env) {
		const admin = await env.WORKFLOW_A.unsafeGetConcurrencyKeysAdmin();
		const url = new URL(request.url);
		if (url.pathname === "/key") {
			return Response.json(await admin.get("shared"));
		}
		if (url.pathname === "/hold") {
			await admin.set("shared", 2);
			await admin.hold("shared");
			return new Response("held");
		}

		await admin.set("shared", 1);
		const hold = await admin.hold("shared");
		await env.WORKER_B.fetch("http://b/?id=waiting", { method: "POST" });
		await admin.waitForWaiters("shared", 1);
		const whileHeld = await admin.get("shared");
		const statusWhileHeld = await (
			await env.WORKER_B.fetch("http://b/?id=waiting")
		).json();

		await admin.release(hold);
		const finished = await waitForStatus(env, "waiting", "complete");
		return Response.json({
			whileHeld: whileHeld.usage,
			statusWhileHeld: statusWhileHeld.status,
			output: finished.output,
			afterwards: (await admin.get("shared")).usage,
		});
	},
};`;

function options(persistPath: string): MiniflareOptions {
	return {
		resourcePersistencePath: persistPath,
		workers: [
			{
				config: {
					name: "worker-a",
					compatibilityDate: "2024-11-20",
					manifest: singleModuleManifest(WORKER_A_SCRIPT),
					env: {
						WORKFLOW_A: {
							type: "workflow",
							name: "workflow-a",
							worker: "worker-a",
							exportName: "KeyedWorkflow",
						},
						WORKER_B: { type: "worker", worker: "worker-b" },
					},
				},
			},
			{
				config: {
					name: "worker-b",
					compatibilityDate: "2024-11-20",
					manifest: singleModuleManifest(WORKER_B_SCRIPT),
					env: {
						WORKFLOW_B: {
							type: "workflow",
							name: "workflow-b",
							worker: "worker-b",
							exportName: "KeyedWorkflow",
						},
					},
				},
			},
		],
	};
}

test("limits keyed steps across the Workflows of every Worker", async ({
	expect,
}) => {
	const mf = new Miniflare(options(await useTmp()));
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/");
	expect(await res.json()).toEqual({
		whileHeld: { holding: 1, waiting: 1 },
		statusWhileHeld: "running",
		output: "done",
		afterwards: { holding: 0, waiting: 0 },
	});
});

test("persists concurrency keys but not their holds across restarts", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const mf = new Miniflare(options(tmp));
	useDispose(mf);
	await (await mf.dispatchFetch("http://localhost/hold")).text();
	const held = await mf.dispatchFetch("http://localhost/key");
	expect(await held.json()).toMatchObject({
		limit: 2,
		usage: { holding: 1, waiting: 0 },
	});
	await mf.dispose();

	const restarted = new Miniflare(options(tmp));
	useDispose(restarted);
	const res = await restarted.dispatchFetch("http://localhost/key");
	expect(await res.json()).toMatchObject({
		name: "shared",
		limit: 2,
		usage: { holding: 0, waiting: 0 },
	});
});

const EXPORTED_SCRIPT = `${KEYED_WORKFLOW}
export class ExportedWorkflow extends KeyedWorkflow {}
export default {
	async fetch(request, env, ctx) {
		const admin = await env.ADMIN_WORKFLOW.unsafeGetConcurrencyKeysAdmin();
		await admin.set("shared", 1);
		const hold = await admin.hold("shared");
		await ctx.exports.ExportedWorkflow.create({ id: "exported" });
		await admin.waitForWaiters("shared", 1);
		await admin.release(hold);
		for (let i = 0; i < 100; i++) {
			const instance = await ctx.exports.ExportedWorkflow.get("exported");
			const status = await instance.status();
			if (status.status === "complete") {
				return Response.json(status.output);
			}
			await scheduler.wait(50);
		}
		return new Response("timed out", { status: 500 });
	},
};`;

test("limits keyed steps of Workflows on ctx.exports", async ({ expect }) => {
	const mf = new Miniflare({
		resourcePersistencePath: await useTmp(),
		workers: [
			{
				config: {
					name: "exporter",
					compatibilityDate: "2024-11-20",
					compatibilityFlags: ["enable_ctx_exports"],
					manifest: singleModuleManifest(EXPORTED_SCRIPT),
					exports: {
						ExportedWorkflow: { type: "workflow", name: "exported-workflow" },
					},
					env: {
						ADMIN_WORKFLOW: {
							type: "workflow",
							name: "admin-workflow",
							worker: "exporter",
							exportName: "KeyedWorkflow",
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/");
	expect(await res.json()).toBe("done");
});

const EXPLORER_SCRIPT = `${KEYED_WORKFLOW}
export default {
	async fetch(request, env) {
		const admin = await env.WORKFLOW_A.unsafeGetConcurrencyKeysAdmin();
		if (new URL(request.url).pathname === "/fill") {
			await admin.hold("shared");
			await env.WORKFLOW_A.create({ id: "waiting" });
			await admin.waitForWaiters("shared", 1);
		}
		return new Response("ok");
	},
};`;

describe("Local Explorer concurrency key endpoints", () => {
	async function explorer(
		mf: Miniflare,
		path: string,
		init?: { method: string; body?: unknown }
	) {
		const res = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/workflows/concurrency${path}`,
			init === undefined
				? undefined
				: {
						method: init.method,
						headers: { "Content-Type": "application/json" },
						body:
							init.body === undefined ? undefined : JSON.stringify(init.body),
					}
		);
		return { status: res.status, body: (await res.json()) as any };
	}

	function explorerMiniflare(persistPath: string) {
		return new Miniflare({
			resourcePersistencePath: persistPath,
			unsafeLocalExplorer: true,
			workers: [
				{
					config: {
						name: "worker-a",
						compatibilityDate: "2024-11-20",
						manifest: singleModuleManifest(EXPLORER_SCRIPT),
						env: {
							WORKFLOW_A: {
								type: "workflow",
								name: "workflow-a",
								worker: "worker-a",
								exportName: "KeyedWorkflow",
							},
						},
					},
				},
			],
		});
	}

	test("creates, reads, updates and deletes keys", async ({ expect }) => {
		const mf = explorerMiniflare(await useTmp());
		useDispose(mf);

		const created = await explorer(mf, "", {
			method: "POST",
			body: { name: "shared", limit: 1 },
		});
		expect(created).toMatchObject({
			status: 200,
			body: {
				success: true,
				result: { name: "shared", limit: 1, usage: { holding: 0, waiting: 0 } },
			},
		});
		const id = created.body.result.id;

		expect(
			await explorer(mf, "", {
				method: "POST",
				body: { name: "shared", limit: 2 },
			})
		).toMatchObject({ status: 409, body: { errors: [{ code: 10701 }] } });
		expect(
			await explorer(mf, "", {
				method: "POST",
				body: { name: "bad", limit: 0 },
			})
		).toMatchObject({ status: 400 });

		expect(await explorer(mf, "")).toMatchObject({
			body: {
				result: [{ id, name: "shared" }],
				result_info: { count: 1, total_count: 1 },
			},
		});
		expect(await explorer(mf, "/shared")).toMatchObject({
			body: { result: { id, referencing_workflows: [] } },
		});

		expect(
			await explorer(mf, `/${id}`, { method: "PATCH", body: { limit: 3 } })
		).toMatchObject({ status: 200, body: { result: { limit: 3 } } });

		expect(await explorer(mf, `/${id}`, { method: "DELETE" })).toMatchObject({
			status: 200,
			body: { result: { status: "ok" } },
		});
		expect(await explorer(mf, `/${id}`)).toMatchObject({
			status: 404,
			body: { errors: [{ code: 10700 }] },
		});
	});

	test("reports the steps holding and waiting for a key", async ({
		expect,
	}) => {
		const mf = explorerMiniflare(await useTmp());
		useDispose(mf);
		await explorer(mf, "", {
			method: "POST",
			body: { name: "shared", limit: 1 },
		});
		await (await mf.dispatchFetch("http://localhost/fill")).text();

		expect(await explorer(mf, "/shared/holders")).toMatchObject({
			body: { result: [{ workflow_name: null, step: null }] },
		});
		expect(await explorer(mf, "/shared/waiters")).toMatchObject({
			body: {
				result: [
					{
						workflow_name: "workflow-a",
						instance_id: "waiting",
						step: "work-1",
						blocked_on: "shared",
						keys: ["shared"],
					},
				],
			},
		});

		const instance = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/workflows/workflow-a/instances/waiting`
		);
		expect(await instance.json()).toMatchObject({
			result: {
				status: "running",
				waiting_for: [
					{
						type: "concurrency_key",
						step: "work-1",
						key: "shared",
						keys: ["shared"],
					},
				],
				steps: [
					{
						name: "work-1",
						type: "step",
						success: null,
						concurrency: { keys: ["shared"], acquired_at: null },
					},
				],
			},
		});

		await explorer(mf, "/shared", { method: "PATCH", body: { limit: 2 } });
		await vi.waitFor(async () => {
			const res = await mf.dispatchFetch(
				`http://localhost${CorePaths.EXPLORER}/api/workflows/workflow-a/instances/waiting`
			);
			const body = (await res.json()) as any;
			expect(body.result).toMatchObject({
				status: "complete",
				waiting_for: [],
				steps: [
					{
						name: "work-1",
						success: true,
						concurrency: { keys: ["shared"], acquired_at: expect.any(String) },
					},
				],
			});
		});
	});
});
