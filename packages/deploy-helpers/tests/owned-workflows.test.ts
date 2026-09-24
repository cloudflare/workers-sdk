import { describe, it } from "vitest";
import { validateOwnedWorkflowDeclarations } from "../src/deploy/helpers/owned-workflows";

describe("validateOwnedWorkflowDeclarations", () => {
	it("accepts a binding and an export that configure the same Workflow settings in different forms", ({
		expect,
	}) => {
		expect(() =>
			validateOwnedWorkflowDeclarations(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "GreetingWorkflow",
							limits: { steps: 10 },
							schedules: "0 * * * *",
						},
					],
					exports: {
						GreetingWorkflow: {
							type: "workflow",
							name: "greeting",
							limits: { steps: 10 },
							concurrency: { limit: 1 },
							schedules: ["0 * * * *"],
						},
					},
				},
				"my-worker"
			)
		).not.toThrow();
	});

	it("errors when a binding and an export declare the same Workflow with different classes", ({
		expect,
	}) => {
		expect(() =>
			validateOwnedWorkflowDeclarations(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "OtherWorkflow",
						},
					],
					exports: {
						GreetingWorkflow: { type: "workflow", name: "greeting" },
					},
				},
				"my-worker"
			)
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: "workflows[0]" and "exports.GreetingWorkflow" both declare the Workflow "greeting", but with different classes ("OtherWorkflow" and "GreetingWorkflow").]`
		);
	});

	it("errors when a binding and an export configure the same Workflow with different settings", ({
		expect,
	}) => {
		expect(() =>
			validateOwnedWorkflowDeclarations(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "GreetingWorkflow",
							limits: { steps: 10 },
							concurrency: { limit: 1 },
							schedules: "0 * * * *",
							default_retention: { success_retention: "1 day" },
						},
					],
					exports: {
						GreetingWorkflow: {
							type: "workflow",
							name: "greeting",
							limits: { steps: 20 },
							concurrency: { limit: 2 },
							schedules: ["30 * * * *"],
							default_retention: { success_retention: "2 days" },
						},
					},
				},
				"my-worker"
			)
		).toThrowErrorMatchingInlineSnapshot(`
			[Error: "workflows[0].limits" and "exports.GreetingWorkflow.limits" both configure the Workflow "greeting", but with different values. Set "limits" in only one of them.
			"workflows[0].concurrency" and "exports.GreetingWorkflow.concurrency" both configure the Workflow "greeting", but with different values. Set "concurrency" in only one of them.
			"workflows[0].schedules" and "exports.GreetingWorkflow.schedules" both configure the Workflow "greeting", but with different values. Set "schedules" in only one of them.
			"workflows[0].default_retention" and "exports.GreetingWorkflow.default_retention" both configure the Workflow "greeting", but with different values. Set "default_retention" in only one of them.]
		`);
	});

	it("does not compare an export against a binding to another Worker's Workflow", ({
		expect,
	}) => {
		expect(() =>
			validateOwnedWorkflowDeclarations(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "OtherWorkflow",
							script_name: "other-worker",
						},
					],
					exports: {
						GreetingWorkflow: { type: "workflow", name: "greeting" },
					},
				},
				"my-worker"
			)
		).not.toThrow();
	});

	it("treats a binding as owned when its script_name matches the deployed name", ({
		expect,
	}) => {
		expect(() =>
			validateOwnedWorkflowDeclarations(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "OtherWorkflow",
							script_name: "deployed-worker",
						},
					],
					exports: {
						GreetingWorkflow: { type: "workflow", name: "greeting" },
					},
				},
				"deployed-worker"
			)
		).toThrow(
			'"workflows[0]" and "exports.GreetingWorkflow" both declare the Workflow "greeting", but with different classes ("OtherWorkflow" and "GreetingWorkflow").'
		);
	});
});
