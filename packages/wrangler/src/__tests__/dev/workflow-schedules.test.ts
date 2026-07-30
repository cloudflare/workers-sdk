import { describe, it } from "vitest";
import { buildMiniflareBindingOptions } from "../../dev/miniflare";

type WorkflowInput = {
	script_name?: string;
	schedules?: string | string[];
};

// Build the miniflare workflow options for a single workflow binding, exercising
// the schedules normalization in `workflowEntry`.
function getWorkflowOptions(workflow: WorkflowInput) {
	const { bindingOptions } = buildMiniflareBindingOptions(
		{
			name: "my-worker",
			bindings: {
				MY_WORKFLOW: {
					type: "workflow",
					name: "my-workflow",
					class_name: "MyWorkflow",
					...(workflow.script_name !== undefined && {
						script_name: workflow.script_name,
					}),
					...(workflow.schedules !== undefined && {
						schedules: workflow.schedules,
					}),
				},
			},
			migrations: undefined,
			exports: undefined,
			queueConsumers: undefined,
			tails: undefined,
			streamingTails: undefined,
			complianceRegion: undefined,
			containerDOClassNames: undefined,
			containerBuildId: undefined,
			enableContainers: false,
		},
		undefined
	);
	return bindingOptions.workflows?.["MY_WORKFLOW"];
}

describe("buildMiniflareBindingOptions — workflow schedules", () => {
	it("wraps a single cron expression string into an array", ({ expect }) => {
		expect(getWorkflowOptions({ schedules: "0 * * * *" })).toMatchObject({
			schedules: ["0 * * * *"],
		});
	});

	it("passes an array of cron expressions through unchanged", ({ expect }) => {
		expect(
			getWorkflowOptions({ schedules: ["0 * * * *", "*/15 * * * *"] })
		).toMatchObject({ schedules: ["0 * * * *", "*/15 * * * *"] });
	});

	it("omits schedules when none are configured", ({ expect }) => {
		expect(getWorkflowOptions({})).not.toHaveProperty("schedules");
	});

	it("errors when schedules are set on a workflow bound to an external script", ({
		expect,
	}) => {
		expect(() =>
			getWorkflowOptions({
				script_name: "other-worker",
				schedules: "0 * * * *",
			})
		).toThrow(/references external script/);
	});
});
