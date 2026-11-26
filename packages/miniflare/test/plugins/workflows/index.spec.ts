import * as fs from "node:fs/promises";
import path from "node:path";
import { scheduler } from "node:timers/promises";
import { Miniflare, WORKFLOWS_PLUGIN_NAME } from "miniflare";
import { assert, describe, test, vi } from "vitest";
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
		// Deterministic ids are unique: create() throws once the instance
		// exists, so later requests read the existing instance instead.
		let workflow;
		try {
			workflow = await env.MY_WORKFLOW.create({id: "an-id"})
		} catch (e) {
			if (!String(e).includes("instance.already_exists")) {
				throw e;
			}
			workflow = await env.MY_WORKFLOW.get("an-id")
		}

		return new Response(JSON.stringify(await workflow.status()))
	},
  };`;

const COMPLETE_STATUS =
	'{"status":"complete","__LOCAL_DEV_STEP_OUTPUTS":["yes you are"],"output":"I\'m a output string"}';

// Requests WORKFLOW_SCRIPT until the instance it creates reports that it is complete, or until
// `timeoutMs` passes, and returns the last status. The first request returns the status as soon as
// the instance is created, when the Workflow may still be running. The timeout starts once
// Miniflare is ready, so a slow startup doesn't use it up.
async function pollWorkflowStatus(mf: Miniflare, timeoutMs = 2000) {
	await mf.ready;
	const begin = performance.now();
	let status = "";
	while (performance.now() - begin < timeoutMs) {
		const res = await mf.dispatchFetch("http://localhost");
		status = await res.text();
		if (status === COMPLETE_STATUS) {
			break;
		}
		await scheduler.wait(50);
	}
	return status;
}

test("starts Workflows with user-provided experimental compatibility flag", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
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
							worker: "workflow-compatibility-flags-worker",
							exportName: "MyWorkflow",
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	expect(await pollWorkflowStatus(mf)).toBe(COMPLETE_STATUS);
});

test("subscribes to Workflow instance events through an RPC target", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					name: "workflow-subscription-worker",
					compatibilityDate: "2026-08-28",
					manifest: singleModuleManifest(`
						import { WorkflowEntrypoint } from "cloudflare:workers";
						export class SubscriptionWorkflow extends WorkflowEntrypoint {
							async run(event, step) {
								await step.do("subscription step", async () => "step output");
								return "workflow output";
							}
						}
						export default {
							async fetch(request, env) {
								const instance = await env.SUBSCRIPTION_WORKFLOW.create({
									id: "subscription-test",
									params: { input: true },
								});
								using subscription = await instance.subscribe();
								const events = [];
								while (true) {
									const result = await subscription.next();
									if (result.done) break;
									events.push(result.value);
								}
								return Response.json(events);
							},
						};
					`),
					env: {
						SUBSCRIPTION_WORKFLOW: {
							type: "workflow",
							name: "SUBSCRIPTION_WORKFLOW",
							worker: "workflow-subscription-worker",
							exportName: "SubscriptionWorkflow",
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	const body = await response.text();
	expect(response.status, body).toBe(200);
	const events = JSON.parse(body) as Array<Record<string, unknown>>;
	expect(events.map(({ type }) => type)).toEqual([
		"workflow_queued",
		"workflow_started",
		"workflow_running",
		"step_started",
		"attempt_started",
		"attempt_completed",
		"step_completed",
		"workflow_completed",
	]);
	expect(events[1]).toMatchObject({
		instanceId: "subscription-test",
		params: { input: true },
	});
	expect(events[2]).toMatchObject({
		type: "workflow_running",
	});
	expect(events[3]).toMatchObject({
		stepName: "subscription step-1",
		config: {
			retries: { limit: 5, delay: 1000, backoff: "exponential" },
			timeout: "10 minutes",
		},
	});
	expect(events[6]).toMatchObject({
		stepName: "subscription step-1",
		output: "step output",
	});
	expect(events[7]).toMatchObject({ output: "workflow output" });
});

test("subscribes to structured and streamed step outputs", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					name: "workflow-step-output-subscription-worker",
					compatibilityDate: "2026-08-28",
					manifest: singleModuleManifest(`
						import { WorkflowEntrypoint } from "cloudflare:workers";
						export class SubscriptionWorkflow extends WorkflowEntrypoint {
							async run(event, step) {
								await step.do("structured output", async () => ({ total: 1n }));
								const stream = await step.do("stream output", async () => {
									return new ReadableStream({
										start(controller) {
											controller.enqueue(new TextEncoder().encode("stream output"));
											controller.close();
										},
									});
								});
								await new Response(stream).arrayBuffer();
								return "done";
							}
						}
						export default {
							async fetch(request, env) {
								const instance = await env.SUBSCRIPTION_WORKFLOW.create({
									id: "step-output-subscription-test",
								});
								using subscription = await instance.subscribe({
									filter: ["step_completed", "workflow_completed"],
								});
								const outputs = [];
								while (true) {
									const result = await subscription.next();
									if (result.done) break;
									if (result.value.type !== "step_completed") continue;
									if (result.value.output instanceof ReadableStream) {
										outputs.push({
											stepName: result.value.stepName,
											output: await new Response(result.value.output).text(),
										});
									} else {
										outputs.push({
											stepName: result.value.stepName,
											output: { total: result.value.output.total.toString() },
										});
									}
								}
								return Response.json(outputs);
							},
						};
					`),
					env: {
						SUBSCRIPTION_WORKFLOW: {
							type: "workflow",
							name: "SUBSCRIPTION_WORKFLOW",
							worker: "workflow-step-output-subscription-worker",
							exportName: "SubscriptionWorkflow",
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	const body = await response.text();
	expect(response.status, body).toBe(200);
	expect(JSON.parse(body)).toEqual([
		{ stepName: "structured output-1", output: { total: "1" } },
		{ stepName: "stream output-1", output: "stream output" },
	]);
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
					name: "worker",
					compatibilityDate: "2024-11-20",
					manifest: singleModuleManifest(WORKFLOW_SCRIPT()),
					env: {
						MY_WORKFLOW: {
							type: "workflow",
							name: "MY_WORKFLOW",
							worker: "worker",
							exportName: "MyWorkflow",
						},
					},
				},
			},
		],
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	expect(await pollWorkflowStatus(mf)).toBe(COMPLETE_STATUS);

	// check if files were committed under the plugin subdirectory
	const names = await fs.readdir(path.join(tmp, WORKFLOWS_PLUGIN_NAME));
	expect(names).toEqual(["miniflare-workflows-MY_WORKFLOW"]);

	// restart miniflare
	await mf.dispose();
	const mf2 = new Miniflare(opts);
	useDispose(mf2);

	// state should be persisted now
	const res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe(COMPLETE_STATUS);
});

const BATCH_WORKFLOW_SCRIPT = () => `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class BatchWorkflow extends WorkflowEntrypoint {
	async run(event) {
		return event.payload;
	}
}
export default {
	async fetch(_request, env) {
		const existing = await env.BATCH_WORKFLOW.create({ id: "existing" });
		await existing.status();

		const explicit = await env.BATCH_WORKFLOW.createBatch({
			instances: [
				{ id: "fresh", params: "fresh-output" },
				{ id: "existing" },
				{ id: "fresh" },
			],
		});
		const counted = await env.BATCH_WORKFLOW.createBatch({
			count: 2,
			params: "count-output",
		});

		return Response.json({
			explicit: {
				created: await Promise.all(
					explicit.created.map(async (instance) => ({
						id: instance.id,
						status: (await instance.status()).status,
					}))
				),
				errors: explicit.errors,
			},
			counted: await Promise.all(
				counted.created.map(async (instance) => ({
					id: instance.id,
					status: (await instance.status()).status,
				}))
			),
		});
	},
};`;

test("supports object-form Workflow batches", async ({ expect }) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					name: "batch-worker",
					compatibilityDate: "2024-11-20",
					manifest: singleModuleManifest(BATCH_WORKFLOW_SCRIPT()),
					env: {
						BATCH_WORKFLOW: {
							type: "workflow",
							name: "BATCH_WORKFLOW",
							worker: "batch-worker",
							exportName: "BatchWorkflow",
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	const result = (await response.json()) as {
		explicit: {
			created: { id: string; status: string }[];
			errors: { index: number; id?: string; code: number; message: string }[];
		};
		counted: { id: string; status: string }[];
	};

	expect(result.explicit).toEqual({
		created: [{ id: "fresh", status: expect.any(String) }],
		errors: [
			{
				index: 1,
				id: "existing",
				code: 10405,
				message: "workflows.api.error.instance.already_exists",
			},
			{
				index: 2,
				id: "fresh",
				code: 10415,
				message: "workflows.api.error.instance.duplicate_in_batch",
			},
		],
	});
	expect(result.counted).toEqual([
		{ id: expect.any(String), status: expect.any(String) },
		{ id: expect.any(String), status: expect.any(String) },
	]);
	expect(result.counted[0].id).not.toBe(result.counted[1].id);
});

const CREATE_ERRORS_WORKFLOW_SCRIPT = () => `
import { RpcTarget, WorkflowEntrypoint } from "cloudflare:workers";
export class CreateErrorsWorkflow extends WorkflowEntrypoint {
	async run() {
		return "done";
	}
}
class Target extends RpcTarget {}
async function rejection(promise) {
	try {
		await promise;
		return "resolved";
	} catch (error) {
		return { name: error.name, message: error.message };
	}
}
async function waitForStatus(instance, status) {
	let current;
	for (let attempt = 0; attempt < 500; attempt++) {
		current = (await instance.status()).status;
		if (current === status || current === "errored" || current === "terminated") {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	return current;
}
export default {
	async fetch(_request, env) {
		const existing = await env.CREATE_ERRORS_WORKFLOW.create({ id: "existing" });

		return Response.json({
			existing: await waitForStatus(existing, "complete"),
			noOptions: await waitForStatus(await env.CREATE_ERRORS_WORKFLOW.create(), "complete"),
			nullOptions: await waitForStatus(
				await env.CREATE_ERRORS_WORKFLOW.create(null),
				"complete"
			),
			optionsBeforeId: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ id: "batch", locationHint: "invalid" })
			),
			optionsBeforeDuplicate: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ id: "existing", locationHint: "invalid" })
			),
			duplicate: await rejection(env.CREATE_ERRORS_WORKFLOW.create({ id: "existing" })),
			invalidId: await rejection(env.CREATE_ERRORS_WORKFLOW.create({ id: "#invalid!" })),
			reservedId: await rejection(env.CREATE_ERRORS_WORKFLOW.create({ id: "batch" })),
			invalidOptions: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ locationHint: "invalid" })
			),
			functionParams: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ params: { fn: () => 1 } })
			),
			rpcTargetParams: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ params: { target: new Target() } })
			),
			streamParams: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ params: { stream: new ReadableStream() } })
			),
			idBeforeParams: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ id: "batch", params: { fn: () => 1 } })
			),
			duplicateBeforeParams: await rejection(
				env.CREATE_ERRORS_WORKFLOW.create({ id: "existing", params: { fn: () => 1 } })
			),
			storableParams: await waitForStatus(
				await env.CREATE_ERRORS_WORKFLOW.create({
					params: {
						map: new Map([[1, 2]]),
						set: new Set([1]),
						date: new Date(0),
						bigint: 10n,
						regexp: /x/g,
						bytes: new Uint8Array([1, 2]),
						buffer: new ArrayBuffer(4),
						blob: new Blob(["x"]),
						headers: new Headers({ a: "b" }),
						request: new Request("https://example.com"),
						error: new Error("x"),
						sparse: [1, , 3],
					},
				}),
				"complete"
			),
		});
	},
};`;

test.for([
	{ serialization: "legacy", compatibilityFlags: [] },
	{
		serialization: "enhanced",
		compatibilityFlags: ["enhanced_error_serialization"],
	},
])(
	"rejects Workflow create() calls with production's error codes ($serialization error serialization)",
	async ({ compatibilityFlags }, { expect }) => {
		const invalidLocationHintRejection = {
			name: "Error",
			message:
				'(body) Invalid option: expected one of "wnam"|"weur"|"enam"|"eeur"|"apac"|"apac-ne"|"apac-se"|"oc"|"sam"|"afr"|"me"',
		};
		const unstorableParamsRejection = {
			name: "Error",
			message: "(body) Provided instance parameters are not serializable",
		};
		const tmp = await useTmp();
		const mf = new Miniflare({
			resourcePersistencePath: tmp,
			workers: [
				{
					config: {
						name: "create-errors-worker",
						compatibilityDate: "2024-11-20",
						compatibilityFlags,
						manifest: singleModuleManifest(CREATE_ERRORS_WORKFLOW_SCRIPT()),
						env: {
							CREATE_ERRORS_WORKFLOW: {
								type: "workflow",
								name: "CREATE_ERRORS_WORKFLOW",
								worker: "create-errors-worker",
								exportName: "CreateErrorsWorkflow",
							},
						},
					},
				},
			],
		});
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost");

		// Without enhanced error serialization, workerd prefixes the messages of
		// error types other than Error with their name when they cross JSRPC.
		expect(await response.json()).toEqual({
			existing: "complete",
			noOptions: "complete",
			nullOptions: "complete",
			// As in production, the options are checked before the id.
			optionsBeforeId: invalidLocationHintRejection,
			optionsBeforeDuplicate: invalidLocationHintRejection,
			duplicate: {
				name: "Error",
				message:
					'(instance.already_exists) Workflow instance with id "existing" already exists',
			},
			invalidId: {
				name: "Error",
				message: "(instance.invalid_id) Instance has invalid id",
			},
			reservedId: {
				name: "Error",
				message: "(instance.invalid_id) Instance has invalid id",
			},
			invalidOptions: {
				name: "Error",
				message:
					'(body) Invalid option: expected one of "wnam"|"weur"|"enam"|"eeur"|"apac"|"apac-ne"|"apac-se"|"oc"|"sam"|"afr"|"me"',
			},
			// JSRPC hands functions and RPC targets to the binding as stubs, and
			// streams as streams. Durable Object storage can clone none of them.
			functionParams: unstorableParamsRejection,
			rpcTargetParams: unstorableParamsRejection,
			streamParams: unstorableParamsRejection,
			// As in production, the id and duplicate checks come first.
			idBeforeParams: {
				name: "Error",
				message: "(instance.invalid_id) Instance has invalid id",
			},
			duplicateBeforeParams: {
				name: "Error",
				message:
					'(instance.already_exists) Workflow instance with id "existing" already exists',
			},
			// Params that storage can clone still run, however unusual.
			storableParams: "complete",
		});
	}
);

const CREATE_BATCH_ERRORS_WORKFLOW_SCRIPT = () => `
import { RpcTarget, WorkflowEntrypoint } from "cloudflare:workers";
export class CreateBatchErrorsWorkflow extends WorkflowEntrypoint {
	async run() {
		return "done";
	}
}
class Target extends RpcTarget {}
async function rejection(promise) {
	try {
		await promise;
		return "resolved";
	} catch (error) {
		return { name: error.name, message: error.message };
	}
}
async function waitForStatus(instance, status) {
	let current;
	for (let attempt = 0; attempt < 500; attempt++) {
		current = (await instance.status()).status;
		if (current === status || current === "errored" || current === "terminated") {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	return current;
}
async function settle(result) {
	return {
		created: await Promise.all(
			result.created.map((instance) => waitForStatus(instance, "complete"))
		),
		errors: result.errors,
	};
}
export default {
	async fetch(_request, env) {
		const workflow = env.CREATE_BATCH_ERRORS_WORKFLOW;
		await waitForStatus(await workflow.create({ id: "existing" }), "complete");
		const fn = () => 1;

		return Response.json({
			emptyObject: await rejection(workflow.createBatch({})),
			nullOptions: await rejection(workflow.createBatch(null)),
			emptyInstances: await rejection(workflow.createBatch({ instances: [] })),
			zeroCount: await rejection(workflow.createBatch({ count: 0 })),
			tooManyCount: await rejection(workflow.createBatch({ count: 101 })),
			invalidOptions: await rejection(
				workflow.createBatch({ instances: [{ locationHint: "invalid" }] })
			),
			nullEntry: await rejection(workflow.createBatch({ instances: [null] })),
			invalidId: await rejection(workflow.createBatch({ instances: [{ id: "-bad" }] })),
			reservedId: await rejection(workflow.createBatch({ instances: [{ id: "batch" }] })),
			optionsBeforeId: await rejection(
				workflow.createBatch({
					instances: [
						{ id: "-bad" },
						{ id: "options-first", retention: { successRetention: "nope" } },
					],
				})
			),
			optionsFirstEntry: await rejection(workflow.get("options-first")),
			retention: await settle(
				await workflow.createBatch({
					instances: [0, -1, 0.5, "0 days", "-1 day", ""].map((successRetention) => ({
						retention: { successRetention },
					})),
				})
			),
			countRetention: await settle(
				await workflow.createBatch({ count: 1, retention: { successRetention: 0 } })
			),
			unstorableParams: await settle(
				await workflow.createBatch({
					instances: [
						{ id: "unstorable", params: { fn } },
						{ id: "plain" },
						{ params: { target: new Target() } },
						{ params: { stream: new ReadableStream() } },
						{ id: "existing", params: { fn } },
						{ id: "repeated" },
						{ id: "repeated", params: { fn } },
					],
				})
			),
			unstorableEntry: await rejection(workflow.get("unstorable")),
			unstorableCount: await settle(
				await workflow.createBatch({ count: 2, params: { fn } })
			),
			arrayEmpty: await rejection(workflow.createBatch([])),
			arrayTooMany: await rejection(
				workflow.createBatch(Array.from({ length: 101 }, () => ({})))
			),
			arrayInvalidOptions: await rejection(
				workflow.createBatch([{ locationHint: "invalid" }])
			),
			arrayNullEntry: await rejection(workflow.createBatch([null])),
			arrayInvalidId: await rejection(workflow.createBatch([{ id: "-bad" }])),
			arrayReservedId: await rejection(workflow.createBatch([{ id: "batch" }])),
			arrayUnstorableParams: await Promise.all(
				(
					await workflow.createBatch([
						{ id: "array-unstorable", params: { fn } },
						{ id: "array-plain" },
						{ id: "existing" },
					])
				).map(async (instance) => ({
					id: instance.id,
					status: await waitForStatus(instance, "complete"),
				}))
			),
			arrayUnstorableEntry: await rejection(workflow.get("array-unstorable")),
		});
	},
};`;

test.for([
	{ serialization: "legacy", compatibilityFlags: [] },
	{
		serialization: "enhanced",
		compatibilityFlags: ["enhanced_error_serialization"],
	},
])(
	"rejects Workflow createBatch() calls with production's error codes ($serialization error serialization)",
	async ({ compatibilityFlags }, { expect }) => {
		const invalidIdRejection = {
			name: "Error",
			message: "(instance.invalid_id) Instance ID is invalid",
		};
		const notFoundRejection = {
			name: "Error",
			message: expect.stringContaining("instance.not_found"),
		};
		const bodyError = { code: 10002, message: "workflows.api.error.body" };
		const tmp = await useTmp();
		const mf = new Miniflare({
			resourcePersistencePath: tmp,
			workers: [
				{
					config: {
						name: "create-batch-errors-worker",
						compatibilityDate: "2024-11-20",
						compatibilityFlags,
						manifest: singleModuleManifest(
							CREATE_BATCH_ERRORS_WORKFLOW_SCRIPT()
						),
						env: {
							CREATE_BATCH_ERRORS_WORKFLOW: {
								type: "workflow",
								name: "CREATE_BATCH_ERRORS_WORKFLOW",
								worker: "create-batch-errors-worker",
								exportName: "CreateBatchErrorsWorkflow",
							},
						},
					},
				},
			],
		});
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost");

		expect(await response.json()).toEqual({
			emptyObject: {
				name: "Error",
				message: "(body) Provided argument is invalid",
			},
			nullOptions: {
				name: "Error",
				message: "(body) Provided argument is invalid",
			},
			emptyInstances: {
				name: "Error",
				message: "(body) Batch size exceeds maximum allowed",
			},
			zeroCount: {
				name: "Error",
				message: "(body) count must be a positive integer",
			},
			tooManyCount: {
				name: "Error",
				message: "(body) batchCreate only supports 100 instances at a time",
			},
			invalidOptions: {
				name: "Error",
				message:
					'(body) Invalid option: expected one of "wnam"|"weur"|"enam"|"eeur"|"apac"|"apac-ne"|"apac-se"|"oc"|"sam"|"afr"|"me"',
			},
			nullEntry: {
				name: "Error",
				message: "(body) Invalid input: expected object, received null",
			},
			invalidId: invalidIdRejection,
			reservedId: invalidIdRejection,
			// As in production, every entry's options are checked before any id,
			// and nothing is created.
			optionsBeforeId: {
				name: "Error",
				message:
					"(body) Duration must be a number or a string in format '{{number}} {{unit}}' where unit is second(s), minute(s), etc.",
			},
			optionsFirstEntry: notFoundRejection,
			// As in production, durations do not have to be positive.
			retention: { created: Array(6).fill("complete"), errors: [] },
			countRetention: { created: ["complete"], errors: [] },
			// JSRPC hands functions and RPC targets to the binding as stubs, and
			// streams as streams. Durable Object storage can clone none of them, so
			// as in production their entries fail on their own, with the ids they
			// would have had.
			unstorableParams: {
				created: ["complete", "complete"],
				errors: [
					{ index: 0, id: "unstorable", ...bodyError },
					{ index: 2, id: expect.any(String), ...bodyError },
					{ index: 3, id: expect.any(String), ...bodyError },
					// As in production, the id checks come first.
					{
						index: 4,
						id: "existing",
						code: 10405,
						message: "workflows.api.error.instance.already_exists",
					},
					{
						index: 6,
						id: "repeated",
						code: 10415,
						message: "workflows.api.error.instance.duplicate_in_batch",
					},
				],
			},
			unstorableEntry: notFoundRejection,
			unstorableCount: {
				created: [],
				errors: [
					{ index: 0, id: expect.any(String), ...bodyError },
					{ index: 1, id: expect.any(String), ...bodyError },
				],
			},
			// The deprecated array form rejects with the object form's errors.
			arrayEmpty: {
				name: "Error",
				message: "(body) Batch size exceeds maximum allowed",
			},
			arrayTooMany: {
				name: "Error",
				message: "(body) Batch size exceeds maximum allowed",
			},
			arrayInvalidOptions: {
				name: "Error",
				message:
					'(body) Invalid option: expected one of "wnam"|"weur"|"enam"|"eeur"|"apac"|"apac-ne"|"apac-se"|"oc"|"sam"|"afr"|"me"',
			},
			arrayNullEntry: {
				name: "Error",
				message: "(body) Invalid input: expected object, received null",
			},
			arrayInvalidId: invalidIdRejection,
			arrayReservedId: invalidIdRejection,
			// As in production, the array form omits the entries that the object
			// form reports as errors.
			arrayUnstorableParams: [{ id: "array-plain", status: "complete" }],
			arrayUnstorableEntry: notFoundRejection,
		});
	}
);

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
					name: "lifecycle-worker",
					compatibilityDate: "2026-03-09",
					manifest: singleModuleManifest(LIFECYCLE_WORKFLOW_SCRIPT()),
					env: {
						LIFECYCLE_WORKFLOW: {
							type: "workflow",
							name: "LIFECYCLE_WORKFLOW",
							worker: "lifecycle-worker",
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

function updateLocalExplorerWorkflowInstanceStatus(
	mf: Miniflare,
	id: string,
	body: Record<string, unknown>
): Promise<Response> {
	return mf.dispatchFetch(
		`http://localhost${CorePaths.EXPLORER}/api/workflows/LIFECYCLE_WORKFLOW/instances/${id}/status`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}

describe("workflow instance lifecycle methods", () => {
	test("enforces binding-only Workflow step limits from unsafeConfig", async ({
		expect,
	}) => {
		const options = lifecycleMiniflareOpts(await useTmp());
		const binding = options.workers[0].config.env?.LIFECYCLE_WORKFLOW;
		assert(binding?.type === "workflow");
		binding.unsafeConfig = { limits: { steps: 1 } };
		const mf = new Miniflare(options);
		useDispose(mf);

		const response = await mf.dispatchFetch(
			"http://localhost/create?id=limited"
		);
		expect(await response.json()).toMatchObject({ id: "limited" });
		expect(await waitForStatus(mf, "limited", "errored")).toMatchObject({
			error: {
				message: expect.stringContaining(
					"The limit of 1 steps has been reached"
				),
			},
		});
	});

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

	test("returns 404 when Explorer deletes a missing instance", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const response = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/workflows/LIFECYCLE_WORKFLOW/instances/never-created`,
			{ method: "DELETE" }
		);
		const body = await response.text();
		expect(response.status, body).toBe(404);
		expect(await getPersistedInstanceFiles(tmp)).toHaveLength(0);
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

describe("Local Explorer workflow instance status endpoint", () => {
	test("pauses and resumes an instance using the production request schema", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);
		const id = "explorer-pause-resume";

		const createResponse = await mf.dispatchFetch(
			`http://localhost/create?id=${id}`
		);
		await createResponse.text();
		await waitForStepOutput(mf, id, "step-1-done");

		const pauseResponse = await updateLocalExplorerWorkflowInstanceStatus(
			mf,
			id,
			{ status: "pause" }
		);
		expect(pauseResponse.status).toBe(200);
		const pauseBody = (await pauseResponse.json()) as {
			result: { status: string; timestamp: string };
			success: boolean;
		};
		expect(pauseBody).toMatchObject({
			success: true,
			result: {
				timestamp: expect.any(String),
			},
		});
		expect(["waitingForPause", "paused"]).toContain(pauseBody.result.status);
		await waitForStatus(mf, id, "paused");

		const pausedResponse = await updateLocalExplorerWorkflowInstanceStatus(
			mf,
			id,
			{ status: "pause" }
		);
		expect(pausedResponse.status).toBe(200);
		expect(await pausedResponse.json()).toMatchObject({
			success: true,
			result: {
				status: "paused",
				timestamp: expect.any(String),
			},
		});

		const resumeResponse = await updateLocalExplorerWorkflowInstanceStatus(
			mf,
			id,
			{ status: "resume" }
		);
		expect(resumeResponse.status).toBe(200);
		const resumeBody = (await resumeResponse.json()) as {
			result: { status: string; timestamp: string };
			success: boolean;
		};
		expect(resumeBody).toMatchObject({
			success: true,
			result: {
				timestamp: expect.any(String),
			},
		});
		expect(["queued", "running"]).toContain(resumeBody.result.status);
		await waitForStatus(mf, id, "complete");
	});

	test("restarts an instance from a step using the production request schema", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);
		const id = "explorer-restart";

		const createResponse = await mf.dispatchFetch(
			`http://localhost/create?id=${id}`
		);
		await createResponse.text();
		await waitForStepOutput(mf, id, "step-1-done");
		const pauseResponse = await mf.dispatchFetch(
			`http://localhost/pause?id=${id}`
		);
		await pauseResponse.text();
		await waitForStatus(mf, id, "paused");

		const response = await updateLocalExplorerWorkflowInstanceStatus(mf, id, {
			status: "restart",
			from: { name: "first step", type: "do" },
		});
		expect(response.status).toBe(200);
		const responseBody = (await response.json()) as {
			result: { status: string; timestamp: string };
			success: boolean;
		};
		expect(responseBody).toMatchObject({
			success: true,
			result: {
				timestamp: expect.any(String),
			},
		});
		expect(["queued", "running"]).toContain(responseBody.result.status);
		await waitForStatus(mf, id, "complete");
	});

	test("returns a conflict when restarting from an unknown step", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);
		const id = "explorer-restart-unknown-step";

		const createResponse = await mf.dispatchFetch(
			`http://localhost/create?id=${id}`
		);
		await createResponse.text();
		await waitForStepOutput(mf, id, "step-1-done");
		const pauseResponse = await mf.dispatchFetch(
			`http://localhost/pause?id=${id}`
		);
		await pauseResponse.text();
		await waitForStatus(mf, id, "paused");

		const response = await updateLocalExplorerWorkflowInstanceStatus(mf, id, {
			status: "restart",
			from: { name: "unknown step", type: "do" },
		});
		const body = (await response.json()) as {
			errors: Array<{ code: number; message: string }>;
			messages: string[];
			result: null;
			success: boolean;
		};

		expect(response.status).toBe(409);
		expect(body).toEqual({
			success: false,
			errors: [
				{
					code: 10001,
					message: expect.stringContaining("(instance.cannot_restart)"),
				},
			],
			messages: [],
			result: null,
		});
	});

	test("terminates an instance with rollback using the production request schema", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);
		const id = "explorer-terminate";

		const createResponse = await mf.dispatchFetch(
			`http://localhost/create?id=${id}`
		);
		await createResponse.text();
		await waitForStepOutput(mf, id, "step-1-done");

		const response = await updateLocalExplorerWorkflowInstanceStatus(mf, id, {
			status: "terminate",
			rollback: true,
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			success: true,
			result: {
				status: "terminated",
				timestamp: expect.any(String),
			},
		});
		await waitForStatus(mf, id, "terminated");
	});

	test("rejects rollback for non-terminate statuses", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		for (const status of ["pause", "resume", "restart"] as const) {
			const response = await updateLocalExplorerWorkflowInstanceStatus(
				mf,
				`rollback-${status}`,
				{ status, rollback: true }
			);
			const body = (await response.json()) as {
				errors: Array<{ code: number; message: string }>;
				messages: string[];
				result: null;
				success: boolean;
			};

			expect(response.status).toBe(400);
			expect(body).toEqual({
				success: false,
				errors: [
					{
						code: 10001,
						message: "'rollback' is only valid when terminating.",
					},
				],
				messages: [],
				result: null,
			});
		}
	});

	test("rejects the legacy action request field", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const response = await updateLocalExplorerWorkflowInstanceStatus(
			mf,
			"legacy-action",
			{ action: "pause" }
		);
		const body = (await response.json()) as {
			errors: Array<{ code: number; message: string }>;
			success: boolean;
		};

		expect(response.status).toBe(400);
		expect(body).toMatchObject({
			success: false,
			errors: [{ code: 10001 }],
		});
	});
});

describe("listing workflow instances by creation date", () => {
	interface ListedInstance {
		id: string;
		status?: string;
		created_on?: string;
	}

	interface ListResponse {
		result: ListedInstance[];
		result_info: { total_count: number };
	}

	async function listInstances(
		mf: Miniflare,
		query: Record<string, string> = {}
	): Promise<{ status: number; body: ListResponse }> {
		const params = new URLSearchParams(query);
		const response = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/workflows/LIFECYCLE_WORKFLOW/instances?${params.toString()}`
		);
		return {
			status: response.status,
			body: (await response.json()) as ListResponse,
		};
	}

	/**
	 * Creates instances sequentially so that each has a distinct `created_on`,
	 * and returns them keyed by instance id.
	 */
	async function createInstances(
		mf: Miniflare,
		ids: string[]
	): Promise<Map<string, string>> {
		for (const id of ids) {
			const response = await mf.dispatchFetch(
				`http://localhost/create?id=${id}`
			);
			await response.text();
			// Creation timestamps have millisecond resolution, so separate them
			// enough that the ordering is unambiguous.
			await scheduler.wait(25);
		}

		const { body } = await listInstances(mf, { per_page: "100" });
		const createdOnById = new Map<string, string>();
		for (const instance of body.result) {
			if (instance.created_on !== undefined) {
				createdOnById.set(instance.id, instance.created_on);
			}
		}
		return createdOnById;
	}

	test("filters instances by date_start and date_end", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const createdOn = await createInstances(mf, ["first", "second", "third"]);
		expect(createdOn.size).toBe(3);

		const firstCreatedOn = createdOn.get("first");
		const secondCreatedOn = createdOn.get("second");
		const thirdCreatedOn = createdOn.get("third");
		assert(
			firstCreatedOn !== undefined &&
				secondCreatedOn !== undefined &&
				thirdCreatedOn !== undefined
		);

		// date_start is inclusive, so the second instance bounds itself.
		const fromSecond = await listInstances(mf, {
			date_start: secondCreatedOn,
		});
		expect(fromSecond.status).toBe(200);
		expect(fromSecond.body.result.map((i) => i.id).sort()).toEqual([
			"second",
			"third",
		]);
		expect(fromSecond.body.result_info.total_count).toBe(2);

		// date_end is inclusive too.
		const untilSecond = await listInstances(mf, { date_end: secondCreatedOn });
		expect(untilSecond.body.result.map((i) => i.id).sort()).toEqual([
			"first",
			"second",
		]);

		// Both bounds together select only the middle instance.
		const onlySecond = await listInstances(mf, {
			date_start: secondCreatedOn,
			date_end: secondCreatedOn,
		});
		expect(onlySecond.body.result.map((i) => i.id)).toEqual(["second"]);

		// A range that predates every instance matches nothing.
		const beforeAll = await listInstances(mf, {
			date_end: new Date(Date.parse(firstCreatedOn) - 1000).toISOString(),
		});
		expect(beforeAll.body.result).toEqual([]);
		expect(beforeAll.body.result_info.total_count).toBe(0);
	});

	test("combines a date filter with a status filter", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const createdOn = await createInstances(mf, ["done-1", "done-2"]);
		await waitForStatus(mf, "done-1", "complete");
		await waitForStatus(mf, "done-2", "complete");

		const firstCreatedOn = createdOn.get("done-1");
		const secondCreatedOn = createdOn.get("done-2");
		assert(firstCreatedOn !== undefined && secondCreatedOn !== undefined);

		const completeFromSecond = await listInstances(mf, {
			status: "complete",
			date_start: secondCreatedOn,
		});
		expect(completeFromSecond.body.result.map((i) => i.id)).toEqual(["done-2"]);

		// The status filter still excludes instances inside the date range.
		const erroredFromFirst = await listInstances(mf, {
			status: "errored",
			date_start: firstCreatedOn,
		});
		expect(erroredFromFirst.body.result).toEqual([]);
	});

	test("rejects an inverted date range", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const { status, body } = await listInstances(mf, {
			date_start: "2026-02-01T00:00:00.000Z",
			date_end: "2026-01-01T00:00:00.000Z",
		});
		expect(status).toBe(400);
		expect(JSON.stringify(body)).toContain(
			"Update 'date_start' or 'date_end' so 'date_start' is before or equal to 'date_end'."
		);
	});

	test("rejects a malformed date", async ({ expect }) => {
		const tmp = await useTmp();
		const mf = new Miniflare({
			...lifecycleMiniflareOpts(tmp),
			unsafeLocalExplorer: true,
		});
		useDispose(mf);

		const { status } = await listInstances(mf, { date_start: "yesterday" });
		expect(status).toBe(400);
	});
});
