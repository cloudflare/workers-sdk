import { describe, it } from "vitest";
import { exports } from "../exports";
import { defineWorker } from "../worker-definition";

describe("defineWorker", () => {
	it("returns a Worker definition", ({ expect }) => {
		expect(
			defineWorker({
				name: "worker",
				compatibilityDate: "2026-07-14",
			})
		).toBeDefined();
	});
});

function validateWorkflowExportKeyTypes() {
	const MyWorkflow = class {};
	const entrypoint = { MyWorkflow };

	defineWorker({
		name: "worker",
		compatibilityDate: "2026-07-14",
		entrypoint,
		exports: {
			MyWorkflow: exports.workflow({ name: "my-workflow" }),
		},
	});

	// @ts-expect-error Workflow export keys must match a WorkflowEntrypoint class export
	defineWorker({
		name: "worker",
		compatibilityDate: "2026-07-14",
		entrypoint,
		exports: {
			MY_WORKFLOW: exports.workflow({ name: "my-workflow" }),
		},
	});

	// @ts-expect-error Workflow export keys must match a WorkflowEntrypoint class export
	defineWorker(() => ({
		name: "worker",
		compatibilityDate: "2026-07-14",
		entrypoint,
		exports: {
			MY_WORKFLOW: exports.workflow({ name: "my-workflow" }),
		},
	}));

	defineWorker({
		name: "worker",
		compatibilityDate: "2026-07-14",
		entrypoint: "./index.ts",
		exports: {
			MY_WORKFLOW: exports.workflow({ name: "my-workflow" }),
		},
	});
}

void validateWorkflowExportKeyTypes;
