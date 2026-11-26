import { describe, it } from "vitest";
import {
	getWorkflowsOwnedByScript,
	validateOwnedWorkflowDeclarations,
} from "../src/deploy/helpers/owned-workflows";

describe("getWorkflowsOwnedByScript", () => {
	it("takes the settings of a Workflow declared in both places from its export", ({
		expect,
	}) => {
		expect(
			getWorkflowsOwnedByScript(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "GreetingWorkflow",
						},
					],
					exports: {
						GreetingWorkflow: {
							type: "workflow",
							name: "greeting",
							jurisdiction: "eu",
						},
						OrdersWorkflow: {
							type: "workflow",
							name: "orders",
							jurisdiction: "us",
						},
					},
				},
				"my-worker"
			)
		).toMatchObject([
			{ name: "greeting", class_name: "GreetingWorkflow", jurisdiction: "eu" },
			{ name: "orders", jurisdiction: "us" },
		]);
	});
});

describe("validateOwnedWorkflowDeclarations", () => {
	it("accepts a binding to a Workflow declared in exports", ({ expect }) => {
		expect(() =>
			validateOwnedWorkflowDeclarations(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "GreetingWorkflow",
							script_name: "my-worker",
						},
					],
					exports: {
						GreetingWorkflow: {
							type: "workflow",
							name: "greeting",
							limits: { steps: 10 },
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

	it("errors when a binding sets settings for a Workflow declared in exports", ({
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
							jurisdiction: "eu",
						},
					],
					exports: {
						GreetingWorkflow: { type: "workflow", name: "greeting" },
					},
				},
				"my-worker"
			)
		).toThrowErrorMatchingInlineSnapshot(`
			[Error: "workflows[0].limits" configures the Workflow "greeting", which "exports.GreetingWorkflow" declares. Set "limits" on the export instead.
			"workflows[0].concurrency" configures the Workflow "greeting", which "exports.GreetingWorkflow" declares. Set "concurrency" on the export instead.
			"workflows[0].schedules" configures the Workflow "greeting", which "exports.GreetingWorkflow" declares. Set "schedules" on the export instead.
			"workflows[0].default_retention" configures the Workflow "greeting", which "exports.GreetingWorkflow" declares. Set "default_retention" on the export instead.
			"workflows[0].jurisdiction" configures the Workflow "greeting", which "exports.GreetingWorkflow" declares. Set "jurisdiction" on the export instead.]
		`);
	});

	it("errors when a binding to another Worker's Workflow shares a name with an export", ({
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
							script_name: "other-worker",
						},
					],
					exports: {
						GreetingWorkflow: { type: "workflow", name: "greeting" },
					},
				},
				"my-worker"
			)
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: "workflows[0]" binds the Workflow "greeting" of the Worker "other-worker", but "exports.GreetingWorkflow" declares it in this Worker. Workflow names are unique per account, so remove "script_name" from the binding or give the export a different name.]`
		);
	});

	it("ignores bindings to another Worker's Workflow with a different name", ({
		expect,
	}) => {
		expect(() =>
			validateOwnedWorkflowDeclarations(
				{
					workflows: [
						{
							binding: "ORDERS",
							name: "orders",
							class_name: "OrdersWorkflow",
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
