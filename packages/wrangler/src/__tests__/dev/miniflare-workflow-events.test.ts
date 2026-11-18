import { describe, it } from "vitest";
import { buildMiniflareBindingOptions } from "../../dev/miniflare";
import type { ArtifactsEventTrigger, Binding } from "@cloudflare/workers-utils";

const CREATED: ArtifactsEventTrigger = {
	type: "cf.artifacts.repo.created",
	filter: { namespace: "ci", repo_name: "app" },
	targets: [{ type: "workflow", workflow_name: "jobs" }],
};

function buildWorkflowOptions({
	bindings = {},
	exports,
	artifactsEvents = [CREATED],
}: {
	bindings?: Record<string, Binding>;
	exports?: Parameters<typeof buildMiniflareBindingOptions>[0]["exports"];
	artifactsEvents?: ArtifactsEventTrigger[];
}) {
	const { bindingOptions } = buildMiniflareBindingOptions(
		{
			name: "app",
			complianceRegion: undefined,
			bindings,
			queueConsumers: undefined,
			migrations: undefined,
			exports,
			tails: [],
			streamingTails: [],
			enableContainers: false,
			artifactsEvents,
		},
		undefined
	);
	return {
		workflows: bindingOptions.workflows,
		workflowExports: bindingOptions.workflowExports,
	};
}

const JOBS_BINDING: Binding = {
	type: "workflow",
	name: "jobs",
	class_name: "Jobs",
};
const EXPECTED_EVENTS = [
	{
		type: "cf.artifacts.repo.created",
		filter: { namespace: "ci", repoName: "app" },
	},
];

describe("Workflow events in local dev", () => {
	it("gives events to the export when a binding declares the same Workflow", ({
		expect,
	}) => {
		const options = buildWorkflowOptions({
			bindings: { JOBS: JOBS_BINDING },
			exports: { Jobs: { type: "workflow", name: "jobs" } },
		});
		expect(options.workflowExports?.Jobs.events).toEqual(EXPECTED_EVENTS);
		expect(options.workflows?.JOBS.events).toBeUndefined();
	});

	it("gives events to the first local binding when there is no export", ({
		expect,
	}) => {
		const options = buildWorkflowOptions({
			bindings: {
				REMOTE: { ...JOBS_BINDING, script_name: "another-worker" },
				JOBS: { ...JOBS_BINDING, script_name: "app" },
				JOBS_AGAIN: JOBS_BINDING,
			},
		});
		expect(options.workflows?.REMOTE.events).toBeUndefined();
		expect(options.workflows?.JOBS.events).toEqual(EXPECTED_EVENTS);
		expect(options.workflows?.JOBS_AGAIN.events).toBeUndefined();
	});

	it.for<{ case: string; bindings: Record<string, Binding> }>([
		{ case: "missing", bindings: {} },
		{
			case: "external",
			bindings: {
				JOBS: { ...JOBS_BINDING, script_name: "another-worker" },
			},
		},
	])("rejects a $case target like deploy does", ({ bindings }, { expect }) => {
		expect(() => buildWorkflowOptions({ bindings })).toThrow(
			'Event trigger "cf.artifacts.repo.created" targets Workflow "jobs", but that Workflow is not defined by this Worker.'
		);
	});
});
