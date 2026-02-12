import { APIError } from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import { fetchResult } from "../../cfetch";
import {
	checkWorkflowConflicts,
	WORKFLOW_NOT_FOUND_CODE,
} from "../../deploy/check-workflow-conflicts";
import type { WorkflowConflict } from "../../deploy/check-workflow-conflicts";
import type { Workflow } from "../../workflows/types";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("../../cfetch");

function mockWorkflowGet(workflowsByName: Record<string, Workflow | null>) {
	vi.mocked(fetchResult).mockImplementation(
		async (_config, resource: string) => {
			const match = resource.match(/\/accounts\/[^/]+\/workflows\/(.+)$/);
			if (match) {
				const workflowName = match[1];
				const workflow = workflowsByName[workflowName];
				if (workflow === null || workflow === undefined) {
					const error = new APIError({ text: "Workflow not found" });
					error.code = WORKFLOW_NOT_FOUND_CODE;
					throw error;
				}
				return workflow;
			}
			throw new Error(`Unexpected resource: ${resource}`);
		}
	);
}

describe("checkWorkflowConflicts", () => {
	it("should return { hasConflicts: false } when there are no workflows in config", async ({
		expect,
	}) => {
		const result = await checkWorkflowConflicts(
			{ workflows: [] } as unknown as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(false);
		expect(fetchResult).not.toHaveBeenCalled();
	});

	it("should return { hasConflicts: false } when workflows is undefined", async ({
		expect,
	}) => {
		const result = await checkWorkflowConflicts(
			{} as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(false);
		expect(fetchResult).not.toHaveBeenCalled();
	});

	it("should return { hasConflicts: false } when workflow does not exist yet", async ({
		expect,
	}) => {
		mockWorkflowGet({ "my-workflow": null });
		const result = await checkWorkflowConflicts(
			{
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			} as unknown as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(false);
	});

	it("should return { hasConflicts: false } when workflow belongs to same worker", async ({
		expect,
	}) => {
		mockWorkflowGet({
			"my-workflow": {
				id: "1",
				name: "my-workflow",
				script_name: "my-worker",
				class_name: "X",
				created_on: "",
				modified_on: "",
			},
		});
		const result = await checkWorkflowConflicts(
			{
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			} as unknown as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(false);
	});

	it("should detect conflict when workflow belongs to different worker", async ({
		expect,
	}) => {
		mockWorkflowGet({
			"my-workflow": {
				id: "1",
				name: "my-workflow",
				script_name: "other-worker",
				class_name: "X",
				created_on: "",
				modified_on: "",
			},
		});
		const result = await checkWorkflowConflicts(
			{
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			} as unknown as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		const { conflicts, message } = result as {
			hasConflicts: true;
			conflicts: WorkflowConflict[];
			message: string;
		};
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toEqual({
			name: "my-workflow",
			currentOwner: "other-worker",
		});
		expect(message).toContain("my-workflow");
		expect(message).toContain("other-worker");
		expect(message).toContain("my-worker");
	});

	it("should detect multiple conflicts", async ({ expect }) => {
		mockWorkflowGet({
			"workflow-a": {
				id: "1",
				name: "workflow-a",
				script_name: "worker-x",
				class_name: "X",
				created_on: "",
				modified_on: "",
			},
			"workflow-b": {
				id: "2",
				name: "workflow-b",
				script_name: "worker-y",
				class_name: "Y",
				created_on: "",
				modified_on: "",
			},
		});
		const result = await checkWorkflowConflicts(
			{
				workflows: [
					{ binding: "WF1", name: "workflow-a", class_name: "A" },
					{ binding: "WF2", name: "workflow-b", class_name: "B" },
				],
			} as unknown as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		const { conflicts, message } = result as {
			hasConflicts: true;
			conflicts: WorkflowConflict[];
			message: string;
		};
		expect(conflicts).toHaveLength(2);
		expect(message).toContain("workflow-a");
		expect(message).toContain("worker-x");
		expect(message).toContain("workflow-b");
		expect(message).toContain("worker-y");
	});

	it("should skip workflows that bind to another script", async ({
		expect,
	}) => {
		// This workflow exists and belongs to other-worker, but we're not deploying it
		// (it has script_name pointing to the external worker)
		mockWorkflowGet({
			"external-workflow": {
				id: "1",
				name: "external-workflow",
				script_name: "other-worker",
				class_name: "X",
				created_on: "",
				modified_on: "",
			},
		});
		const result = await checkWorkflowConflicts(
			{
				workflows: [
					{
						binding: "WF",
						name: "external-workflow",
						class_name: "MyWorkflow",
						script_name: "other-worker",
					},
				],
			} as unknown as Config,
			"account-id",
			"my-worker"
		);
		// This workflow has script_name set to another worker, so it's not being deployed by us
		expect(result.hasConflicts).toBe(false);
		// fetchResult should not have been called because the workflow is filtered out
		expect(fetchResult).not.toHaveBeenCalled();
	});

	it("should only flag workflows being deployed by this script", async ({
		expect,
	}) => {
		mockWorkflowGet({
			"local-workflow": {
				id: "1",
				name: "local-workflow",
				script_name: "other-worker",
				class_name: "X",
				created_on: "",
				modified_on: "",
			},
			// external-workflow won't be queried because it's filtered out
		});
		const result = await checkWorkflowConflicts(
			{
				workflows: [
					// This one will be deployed by us (no script_name)
					{ binding: "WF1", name: "local-workflow", class_name: "A" },
					// This one is external (script_name points to another worker)
					{
						binding: "WF2",
						name: "external-workflow",
						class_name: "B",
						script_name: "some-other-worker",
					},
				],
			} as unknown as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		const { conflicts } = result as {
			hasConflicts: true;
			conflicts: WorkflowConflict[];
			message: string;
		};
		// Only the local workflow should be flagged as a conflict
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].name).toBe("local-workflow");
	});

	it("should generate correct message for single conflict", async ({
		expect,
	}) => {
		mockWorkflowGet({
			"my-workflow": {
				id: "1",
				name: "my-workflow",
				script_name: "other-worker",
				class_name: "X",
				created_on: "",
				modified_on: "",
			},
		});
		const result = await checkWorkflowConflicts(
			{
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			} as unknown as Config,
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		const { message } = result as {
			hasConflicts: true;
			conflicts: WorkflowConflict[];
			message: string;
		};
		expect(message).toBe(
			`The following workflow(s) already exist and belong to different workers:\n` +
				`  - "my-workflow" (currently belongs to "other-worker")\n\n` +
				`Deploying will reassign these workflows to "my-worker".`
		);
	});
});
