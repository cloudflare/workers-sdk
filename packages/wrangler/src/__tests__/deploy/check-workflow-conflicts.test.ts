import { APIError } from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import { fetchResult } from "../../cfetch";
import {
	checkWorkflowConflicts,
	WORKFLOW_NOT_FOUND_CODE,
} from "../../deploy/check-workflow-conflicts";
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

const baseConfig = {} as Config;

describe("checkWorkflowConflicts", () => {
	it("should return { hasConflicts: false } when there are no workflows in config", async ({
		expect,
	}) => {
		const result = await checkWorkflowConflicts(
			{ ...baseConfig, workflows: [] },
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
			baseConfig,
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
				...baseConfig,
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			},
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
				...baseConfig,
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			},
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
				...baseConfig,
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			},
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		if (result.hasConflicts) {
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0]).toEqual({
				name: "my-workflow",
				currentOwner: "other-worker",
			});
			expect(result.message).toContain("my-workflow");
			expect(result.message).toContain("other-worker");
			expect(result.message).toContain("my-worker");
		}
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
				...baseConfig,
				workflows: [
					{ binding: "WF1", name: "workflow-a", class_name: "A" },
					{ binding: "WF2", name: "workflow-b", class_name: "B" },
				],
			},
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		if (result.hasConflicts) {
			expect(result.conflicts).toHaveLength(2);
			expect(result.message).toContain("workflow-a");
			expect(result.message).toContain("worker-x");
			expect(result.message).toContain("workflow-b");
			expect(result.message).toContain("worker-y");
		}
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
				...baseConfig,
				workflows: [
					{
						binding: "WF",
						name: "external-workflow",
						class_name: "MyWorkflow",
						script_name: "other-worker",
					},
				],
			},
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
				...baseConfig,
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
			},
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		if (result.hasConflicts) {
			// Only the local workflow should be flagged as a conflict
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0].name).toBe("local-workflow");
		}
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
				...baseConfig,
				workflows: [
					{ binding: "WF", name: "my-workflow", class_name: "MyWorkflow" },
				],
			},
			"account-id",
			"my-worker"
		);
		expect(result.hasConflicts).toBe(true);
		if (result.hasConflicts) {
			expect(result.message).toBe(
				`The following workflow(s) already exist and belong to different workers:\n` +
					`  - "my-workflow" (currently belongs to "other-worker")\n\n` +
					`Deploying will reassign these workflows to "my-worker".`
			);
		}
	});
});
