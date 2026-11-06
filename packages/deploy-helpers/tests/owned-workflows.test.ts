import { describe, it } from "vitest";
import {
	getWorkflowsOwnedByScript,
	validateOwnedWorkflowDeclarations,
} from "../src/deploy/helpers/owned-workflows";

describe("getWorkflowsOwnedByScript", () => {
	it("returns owned Workflows from both bindings and exports", ({ expect }) => {
		expect(
			getWorkflowsOwnedByScript(
				{
					workflows: [
						{
							binding: "GREETING",
							name: "greeting",
							class_name: "GreetingWorkflow",
							jurisdiction: "eu",
						},
						{
							binding: "OTHER",
							name: "other",
							class_name: "OtherWorkflow",
							script_name: "other-worker",
						},
					],
					exports: {
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
			{ name: "orders", class_name: "OrdersWorkflow", jurisdiction: "us" },
		]);
	});
});

describe("validateOwnedWorkflowDeclarations", () => {
	it("errors when a binding and an export declare the same Workflow", ({
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
						},
					],
					exports: {
						GreetingWorkflow: { type: "workflow", name: "greeting" },
					},
				},
				"my-worker"
			)
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: "workflows[0]" and "exports.GreetingWorkflow" both declare the Workflow "greeting". Declare it in only one place: keep the "workflows" entry, or remove it and keep the "exports" entry, using \`ctx.exports.GreetingWorkflow\` in your code.]`
		);
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
			'"workflows[0]" and "exports.GreetingWorkflow" both declare the Workflow "greeting".'
		);
	});
});
