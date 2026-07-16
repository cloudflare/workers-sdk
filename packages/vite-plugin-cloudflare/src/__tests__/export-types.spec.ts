import { describe, test } from "vitest";
import { getInitialWorkerNameToExportTypesMap } from "../export-types";
import type { WorkersResolvedConfig } from "../plugin-config";

describe("getInitialWorkerNameToExportTypesMap", () => {
	test("discovers declarative Workflow exports", ({ expect }) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([
				[
					"worker",
					{
						config: {
							name: "workflow-worker",
							exports: {
								MyWorkflow: {
									type: "workflow",
									name: "my-workflow",
								},
							},
							migrations: [],
							durable_objects: { bindings: [] },
							services: [],
							workflows: [],
						},
					},
				],
			]),
		} as unknown as WorkersResolvedConfig;

		expect(
			getInitialWorkerNameToExportTypesMap(resolvedPluginConfig).get(
				"workflow-worker"
			)
		).toEqual({ MyWorkflow: "WorkflowEntrypoint" });
	});
});
