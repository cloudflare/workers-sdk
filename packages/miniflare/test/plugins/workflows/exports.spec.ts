import * as fs from "node:fs/promises";
import path from "node:path";
import { scheduler } from "node:timers/promises";
import { Miniflare, WORKFLOWS_PLUGIN_NAME } from "miniflare";
import { describe, onTestFinished, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { WorkerOptions } from "miniflare";

// Requests use `ctx.exports.<workflow>`, or `env.<binding>` if `binding` is set.
const WORKFLOW_SCRIPT = `
import { WorkflowEntrypoint } from "cloudflare:workers";

class TestWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		const outputs = [];
		for (let i = 0; i < (event.payload?.steps ?? 1); i++) {
			outputs.push(await step.do("step " + i, async () => "step-" + i));
		}
		if (event.payload?.waitForEvent) {
			const received = await step.waitForEvent("wait", { type: "continue" });
			outputs.push(received.payload);
		}
		return outputs;
	}
}
export class MyWorkflow extends TestWorkflow {}
export class OtherWorkflow extends TestWorkflow {}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const binding = url.searchParams.get("binding");
		const workflow =
			binding === null
				? ctx.exports[url.searchParams.get("workflow") ?? "MyWorkflow"]
				: env[binding];
		const id = url.searchParams.get("id");
		try {
			switch (url.pathname) {
				case "/create": {
					const params = JSON.parse(url.searchParams.get("params") ?? "{}");
					const instance = await workflow.create({ id, params });
					return Response.json({ id: instance.id });
				}
				case "/create-batch": {
					const ids = url.searchParams.getAll("id");
					const instances = await workflow.createBatch(ids.map((id) => ({ id })));
					return Response.json(instances.map((instance) => instance.id));
				}
				case "/delete-batch":
					return Response.json(
						await workflow.deleteBatch(url.searchParams.getAll("id"))
					);
				case "/status":
					return Response.json(await (await workflow.get(id)).status());
				case "/event": {
					const instance = await workflow.get(id);
					await instance.sendEvent({ type: "continue", payload: "event-payload" });
					return Response.json({ ok: true });
				}
				default: {
					const instance = await workflow.get(id);
					await instance[url.pathname.slice(1)]();
					return Response.json({ ok: true });
				}
			}
		} catch (e) {
			return new Response(String(e), { status: 500 });
		}
	},
};`;

const MY_WORKFLOW_EXPORT = {
	MyWorkflow: { type: "workflow", name: "my-workflow" },
} as const;

type Fetch = (
	url: string
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

function worker(
	name: string,
	config: Pick<WorkerOptions["config"], "env" | "exports">
): WorkerOptions {
	return {
		config: {
			name,
			compatibilityDate: "2026-08-28",
			manifest: singleModuleManifest(WORKFLOW_SCRIPT),
			...config,
		},
	};
}

async function fetchJson(fetch: Fetch, url: string): Promise<unknown> {
	const response = await fetch(`http://localhost${url}`);
	const body = await response.text();
	if (!response.ok) {
		throw new Error(`${url} failed with ${response.status}: ${body}`);
	}
	return JSON.parse(body);
}

async function waitForStatus(
	fetch: Fetch,
	query: string,
	status: string,
	stepOutputs?: string[],
	timeoutMs = 5000
): Promise<Record<string, unknown>> {
	const begin = performance.now();
	let last = "";
	while (performance.now() - begin < timeoutMs) {
		const response = await fetch(`http://localhost/status?${query}`);
		last = await response.text();
		if (response.ok) {
			const result = JSON.parse(last) as Record<string, unknown>;
			if (
				result.status === status &&
				(stepOutputs === undefined ||
					JSON.stringify(result.__LOCAL_DEV_STEP_OUTPUTS) ===
						JSON.stringify(stepOutputs))
			) {
				return result;
			}
		}
		await scheduler.wait(100);
	}
	throw new Error(
		`Timed out waiting for status "${status}" of ${query}. Last response: ${last}`
	);
}

async function getPersistedInstanceFiles(tmp: string): Promise<string[]> {
	const files = await fs.readdir(
		path.join(tmp, WORKFLOWS_PLUGIN_NAME, "miniflare-workflows-my-workflow")
	);
	return files.filter(
		(file) => file.endsWith(".sqlite") && file !== "metadata.sqlite"
	);
}

describe("Workflows on ctx.exports", () => {
	test("runs the Workflow API", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			resourcePersistencePath: tmp,
			workers: [worker("exporter", { exports: MY_WORKFLOW_EXPORT })],
		});
		useDispose(mf);
		const fetch: Fetch = (url) => mf.dispatchFetch(url);

		const params = encodeURIComponent(JSON.stringify({ waitForEvent: true }));
		expect(
			await fetchJson(fetch, `/create?id=instance&params=${params}`)
		).toEqual({ id: "instance" });
		await waitForStatus(fetch, "id=instance", "running", ["step-0"]);

		await fetchJson(fetch, "/pause?id=instance");
		await waitForStatus(fetch, "id=instance", "paused");
		await fetchJson(fetch, "/resume?id=instance");
		await waitForStatus(fetch, "id=instance", "running", ["step-0"]);

		await fetchJson(fetch, "/event?id=instance");
		expect(await waitForStatus(fetch, "id=instance", "complete")).toMatchObject(
			{ output: ["step-0", "event-payload"] }
		);

		await fetchJson(fetch, "/restart?id=instance");
		await waitForStatus(fetch, "id=instance", "running", ["step-0"]);
		await fetchJson(fetch, "/terminate?id=instance");
		await waitForStatus(fetch, "id=instance", "terminated");

		expect(
			await fetchJson(fetch, "/create-batch?id=batch-1&id=batch-2")
		).toEqual(["batch-1", "batch-2"]);
		await waitForStatus(fetch, "id=batch-1", "complete");
		await waitForStatus(fetch, "id=batch-2", "complete");
		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(3);

		await fetchJson(fetch, "/delete?id=instance");
		await fetchJson(fetch, "/delete-batch?id=batch-1&id=batch-2");
		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(0);

		for (const id of ["instance", "batch-1", "missing"]) {
			const response = await mf.dispatchFetch(
				`http://localhost/status?id=${id}`
			);
			expect(response.status).toBe(500);
			expect(await response.text()).toContain("instance.not_found");
		}
	});

	test("applies the step limits of exports and of the exporting Worker's own bindings", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				worker("exporter", {
					exports: {
						MyWorkflow: {
							type: "workflow",
							name: "limited",
							limits: { steps: 1 },
						},
						OtherWorkflow: {
							type: "workflow",
							name: "overridden",
							limits: { steps: 1 },
						},
					},
					env: {
						OVERRIDDEN: {
							type: "workflow",
							name: "overridden",
							worker: "exporter",
							exportName: "OtherWorkflow",
							limits: { steps: 2 },
						},
					},
				}),
			],
		});
		useDispose(mf);
		const fetch: Fetch = (url) => mf.dispatchFetch(url);

		const params = encodeURIComponent(JSON.stringify({ steps: 2 }));
		await fetchJson(fetch, `/create?id=limited&params=${params}`);
		expect(await waitForStatus(fetch, "id=limited", "errored")).toMatchObject({
			error: {
				message: expect.stringContaining(
					"The limit of 1 steps has been reached"
				),
			},
		});

		await fetchJson(
			fetch,
			`/create?workflow=OtherWorkflow&id=overridden&params=${params}`
		);
		expect(
			await waitForStatus(
				fetch,
				"workflow=OtherWorkflow&id=overridden",
				"complete"
			)
		).toMatchObject({ output: ["step-0", "step-1"] });
	});

	test("shares instances with env bindings of the exporting Worker", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				worker("exporter", {
					exports: MY_WORKFLOW_EXPORT,
					env: {
						MY_WORKFLOW: {
							type: "workflow",
							name: "my-workflow",
							worker: "exporter",
							exportName: "MyWorkflow",
						},
					},
				}),
			],
		});
		useDispose(mf);
		const fetch: Fetch = (url) => mf.dispatchFetch(url);

		await fetchJson(fetch, "/create?binding=MY_WORKFLOW&id=from-env");
		expect(await waitForStatus(fetch, "id=from-env", "complete")).toMatchObject(
			{ output: ["step-0"] }
		);

		await fetchJson(fetch, "/create?id=from-exports");
		expect(
			await waitForStatus(
				fetch,
				"binding=MY_WORKFLOW&id=from-exports",
				"complete"
			)
		).toMatchObject({ output: ["step-0"] });
	});

	test("shares instances with env bindings of other Workers", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				worker("caller", {
					env: {
						MY_WORKFLOW: {
							type: "workflow",
							name: "my-workflow",
							worker: "exporter",
							exportName: "MyWorkflow",
						},
					},
				}),
				worker("exporter", { exports: MY_WORKFLOW_EXPORT }),
			],
		});
		useDispose(mf);
		const callerFetch: Fetch = (url) => mf.dispatchFetch(url);
		const exporter = await mf.getWorker("exporter");
		const exporterFetch: Fetch = (url) => exporter.fetch(url);

		await fetchJson(callerFetch, "/create?binding=MY_WORKFLOW&id=from-caller");
		expect(
			await waitForStatus(exporterFetch, "id=from-caller", "complete")
		).toMatchObject({ output: ["step-0"] });

		await fetchJson(exporterFetch, "/create?id=from-exporter");
		expect(
			await waitForStatus(
				callerFetch,
				"binding=MY_WORKFLOW&id=from-exporter",
				"complete"
			)
		).toMatchObject({ output: ["step-0"] });
	});

	test("keeps instances across restarts, including ones created before the Workflow was exported", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const bindingOnly = new Miniflare({
			resourcePersistencePath: tmp,
			workers: [
				worker("exporter", {
					env: {
						MY_WORKFLOW: {
							type: "workflow",
							name: "my-workflow",
							worker: "exporter",
							exportName: "MyWorkflow",
						},
					},
				}),
			],
		});
		useDispose(bindingOnly);
		await fetchJson(
			(url) => bindingOnly.dispatchFetch(url),
			"/create?binding=MY_WORKFLOW&id=before-export"
		);
		await waitForStatus(
			(url) => bindingOnly.dispatchFetch(url),
			"binding=MY_WORKFLOW&id=before-export",
			"complete"
		);
		await bindingOnly.dispose();

		const exportedOptions = {
			resourcePersistencePath: tmp,
			workers: [worker("exporter", { exports: MY_WORKFLOW_EXPORT })],
		};
		const exported = new Miniflare(exportedOptions);
		useDispose(exported);
		const exportedFetch: Fetch = (url) => exported.dispatchFetch(url);
		expect(
			await waitForStatus(exportedFetch, "id=before-export", "complete")
		).toMatchObject({ output: ["step-0"] });
		await fetchJson(exportedFetch, "/create?id=after-export");
		await waitForStatus(exportedFetch, "id=after-export", "complete");
		await exported.dispose();

		const restarted = new Miniflare(exportedOptions);
		useDispose(restarted);
		const restartedFetch: Fetch = (url) => restarted.dispatchFetch(url);
		for (const id of ["before-export", "after-export"]) {
			expect(
				await waitForStatus(restartedFetch, `id=${id}`, "complete")
			).toMatchObject({ output: ["step-0"] });
		}
		expect(await fs.readdir(path.join(tmp, WORKFLOWS_PLUGIN_NAME))).toEqual([
			"miniflare-workflows-my-workflow",
		]);
	});

	test.for([
		{ label: "declared only in exports", bound: false },
		{ label: "also bound in env", bound: true },
	])(
		"manages instances in the Local Explorer when $label",
		async ({ bound }, { expect }) => {
			const mf = new Miniflare({
				unsafeLocalExplorer: true,
				workers: [
					worker("exporter", {
						exports: MY_WORKFLOW_EXPORT,
						env: bound
							? {
									MY_WORKFLOW: {
										type: "workflow",
										name: "my-workflow",
										worker: "exporter",
										exportName: "MyWorkflow",
									},
								}
							: {},
					}),
				],
			});
			useDispose(mf);
			const fetch: Fetch = (url) => mf.dispatchFetch(url);
			const api = `${CorePaths.EXPLORER}/api/workflows`;

			expect(await fetchJson(fetch, api)).toMatchObject({
				success: true,
				result: [
					{
						name: "my-workflow",
						class_name: "MyWorkflow",
						script_name: "exporter",
					},
				],
			});

			const created = await mf.dispatchFetch(
				`http://localhost${api}/my-workflow/instances`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id: "from-explorer" }),
				}
			);
			expect(await created.json()).toMatchObject({
				success: true,
				result: { id: "from-explorer" },
			});
			await fetchJson(fetch, "/create?id=from-worker");
			await waitForStatus(fetch, "id=from-explorer", "complete");
			await waitForStatus(fetch, "id=from-worker", "complete");

			const listed = (await fetchJson(
				fetch,
				`${api}/my-workflow/instances`
			)) as { result: { id: string }[] };
			expect(listed.result.map(({ id }) => id).sort()).toEqual([
				"from-explorer",
				"from-worker",
			]);
			expect(
				await fetchJson(fetch, `${api}/my-workflow/instances/from-explorer`)
			).toMatchObject({
				success: true,
				result: { status: "complete", output: ["step-0"] },
			});
		}
	);

	test("rejects two Workers exporting the same Workflow", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				worker("a", { exports: MY_WORKFLOW_EXPORT }),
				worker("b", {
					exports: { OtherWorkflow: { type: "workflow", name: "my-workflow" } },
				}),
			],
		});
		onTestFinished(() => mf.dispose().catch(() => {}));

		await expect(mf.ready).rejects.toMatchObject({
			code: "ERR_VALIDATION",
			message:
				'Workflow "my-workflow" is exported as "MyWorkflow" by Worker "a" and as "OtherWorkflow" by Worker "b". Workflow names must be unique.',
		});
	});

	test("rejects bindings to an exported Workflow that refer to another class", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				worker("exporter", {
					exports: MY_WORKFLOW_EXPORT,
					env: {
						MY_WORKFLOW: {
							type: "workflow",
							name: "my-workflow",
							worker: "exporter",
							exportName: "OtherWorkflow",
						},
					},
				}),
			],
		});
		onTestFinished(() => mf.dispose().catch(() => {}));

		await expect(mf.ready).rejects.toMatchObject({
			code: "ERR_VALIDATION",
			message:
				'Workflow binding "MY_WORKFLOW" of Worker "exporter" refers to class "OtherWorkflow" of Worker "exporter", but Workflow "my-workflow" is exported as "MyWorkflow" by Worker "exporter".',
		});
	});
});
