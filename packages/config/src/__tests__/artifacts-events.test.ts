import { describe, it } from "vitest";
import { convertToWranglerConfig } from "../convert";
import { ARTIFACTS_EVENT_TYPES, triggers } from "../public";
import { InputWorkerSchema, OutputWorkerSchema } from "../schema";
import type { WorkerConfig } from "../public";

const trigger = triggers.artifactsEvent({
	eventType: "cf.artifacts.repo.created",
	filter: { namespace: "examples", repoName: "demo" },
	targets: [{ type: "workflow", workflowName: "on-repo" }],
});
const worker = {
	name: "example",
	compatibilityDate: "2026-09-03",
	triggers: [triggers.scheduled({ schedule: "0 * * * *" }), trigger],
} satisfies WorkerConfig;

describe.each([
	["input", InputWorkerSchema],
	["output", OutputWorkerSchema],
] as const)("%s Artifacts event triggers", (_name, schema) => {
	it.for(ARTIFACTS_EVENT_TYPES)(
		"accepts %s via the public helper",
		(eventType, { expect }) => {
			expect(
				schema.parse({
					...worker,
					triggers: [triggers.artifactsEvent({ ...trigger, eventType })],
				}).triggers
			).toEqual([{ ...trigger, eventType }]);
		}
	);
	it.for([
		{ eventType: "unknown" },
		{ filter: { namespace: "" } },
		{ filter: { repoName: "" } },
		{ filter: { repo_name: "demo" } },
		{ targets: [] },
		{ targets: [{ type: "workflow", workflowName: "" }] },
		{ targets: [{ type: "queue", queue: "events" }] },
	])("rejects invalid trigger properties %j", (invalid, { expect }) => {
		expect(
			schema.safeParse({ ...worker, triggers: [{ ...trigger, ...invalid }] })
				.success
		).toBe(false);
	});
});

it("converts native Artifacts triggers to deployable Wrangler events without losing crons", ({
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
				type: "cf.artifacts.repo.created",
				filter: { namespace: "examples", repo_name: "demo" },
				targets: [{ type: "workflow", workflow_name: "on-repo" }],
			},
		],
	});
});

it("preserves an unfiltered native trigger without introducing filter keys", ({
	expect,
}) => {
	const { filter: _filter, ...unfiltered } = trigger;
	const result = convertToWranglerConfig({
		worker: InputWorkerSchema.parse({ ...worker, triggers: [unfiltered] }),
		containers: [],
	});
	expect(result.triggers).toEqual({
		events: [
			{
				type: "cf.artifacts.repo.created",
				targets: [{ type: "workflow", workflow_name: "on-repo" }],
			},
		],
	});
});
