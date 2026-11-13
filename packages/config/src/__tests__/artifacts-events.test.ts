import { ARTIFACTS_EVENT_TYPES as WRANGLER_EVENT_TYPES } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { convertToWranglerConfig } from "../convert";
import { exports, triggers } from "../public";
import { InputWorkerSchema, OutputWorkerSchema } from "../schema";
import { ARTIFACTS_EVENT_TYPES } from "../workflow-events";
import type { WorkerConfig, WorkflowEvent } from "../public";

const event = {
	type: "cf.artifacts.repo.created",
	filter: { namespace: "examples", repoName: "demo" },
} satisfies WorkflowEvent;
const worker = {
	name: "example",
	compatibilityDate: "2026-09-03",
	exports: { OnRepo: exports.workflow({ name: "on-repo", events: [event] }) },
	triggers: [triggers.scheduled({ schedule: "0 * * * *" })],
} satisfies WorkerConfig;

it("supports the same event types as Wrangler", ({ expect }) => {
	expect(ARTIFACTS_EVENT_TYPES).toEqual(WRANGLER_EVENT_TYPES);
});

describe.each([
	["input", InputWorkerSchema],
	["output", OutputWorkerSchema],
] as const)("%s Workflow events", (_name, schema) => {
	it.for(ARTIFACTS_EVENT_TYPES)(
		"accepts %s on a Workflow export",
		(type, { expect }) => {
			const workflow = exports.workflow({
				name: "on-repo",
				events: [{ ...event, type }],
			});
			expect(
				schema.parse({ ...worker, exports: { OnRepo: workflow } }).exports
			).toEqual({ OnRepo: workflow });
		}
	);
	it.for([
		{ type: "unknown" },
		{ filter: { namespace: "" } },
		{ filter: { repoName: "" } },
		{ filter: { repo_name: "demo" } },
		{ targets: [{ type: "workflow", workflowName: "other" }] },
	])("rejects invalid event properties %j", (invalid, { expect }) => {
		expect(
			schema.safeParse({
				...worker,
				exports: {
					OnRepo: {
						type: "workflow",
						name: "on-repo",
						events: [{ ...event, ...invalid }],
					},
				},
			}).success
		).toBe(false);
	});
	it("rejects the removed top-level event trigger shape", ({ expect }) => {
		expect(
			schema.safeParse({
				...worker,
				triggers: [
					{
						type: "artifacts-event",
						eventType: event.type,
						targets: [{ type: "workflow", workflowName: "on-repo" }],
					},
				],
			}).success
		).toBe(false);
	});
});

it("converts Workflow-owned events to Wrangler subscriptions without losing crons", ({
	expect,
}) => {
	const result = convertToWranglerConfig({
		worker: InputWorkerSchema.parse(worker),
		containers: [],
	});
	expect(result.triggers).toEqual({
		crons: ["0 * * * *"],
		events: [
			{
				type: event.type,
				filter: { namespace: "examples", repo_name: "demo" },
				targets: [{ type: "workflow", workflow_name: "on-repo" }],
			},
		],
	});
	expect(result.exports?.OnRepo).toEqual({ type: "workflow", name: "on-repo" });
});

it("derives each target from its owner and omits absent filters", ({
	expect,
}) => {
	const config = {
		...worker,
		exports: {
			First: exports.workflow({
				name: "first",
				events: [{ type: event.type }],
			}),
			Second: exports.workflow({
				name: "second",
				events: [{ type: event.type }],
			}),
		},
	};
	const result = convertToWranglerConfig({
		worker: InputWorkerSchema.parse(config),
		containers: [],
	});
	expect(result.triggers?.events).toEqual(
		["first", "second"].map((workflow_name) => ({
			type: event.type,
			targets: [{ type: "workflow", workflow_name }],
		}))
	);
});
