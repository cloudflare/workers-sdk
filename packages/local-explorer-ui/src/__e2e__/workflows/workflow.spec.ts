import { describe, test } from "vitest";
import {
	navigateToWorkflow,
	navigateToWorkflows,
	page,
	waitForText,
} from "../utils";

describe("Workflows", () => {
	describe("workflow list", () => {
		test("displays the workflow in the list", async ({ expect }) => {
			await navigateToWorkflows();
			await waitForText("Workflows");

			const workflowLink = page.getByRole("link", { name: /my-workflow/i });
			expect(await workflowLink.isVisible()).toBe(true);
		});
	});

	describe("workflow detail", () => {
		test("displays workflow name and tabs", async () => {
			await navigateToWorkflow("my-workflow");
			await waitForText("my-workflow");
			await waitForText("Instances");
			await waitForText("Settings");
		});
	});

	describe("workflow diagram", () => {
		test("displays the diagram panel with step nodes", async () => {
			await navigateToWorkflow("my-workflow");
			await waitForText("my-workflow");

			// The diagram should render step nodes from the workflow
			// The fixture's MyWorkflow has: step.do("greet"), step.sleep("wait"), step.do("finalize")
			await waitForText("greet");
			await waitForText("wait");
			await waitForText("finalize");
		});

		test("displays step type labels in diagram", async () => {
			await navigateToWorkflow("my-workflow");
			await waitForText("my-workflow");

			// Step type headers should be visible
			await waitForText("do");
			await waitForText("sleep");
		});

		test("displays copy and refresh buttons", async ({ expect }) => {
			await navigateToWorkflow("my-workflow");
			await waitForText("my-workflow");

			const copyButton = page.getByRole("button", {
				name: "Copy diagram to clipboard",
			});
			const refreshButton = page.getByRole("button", {
				name: "Refresh diagram",
			});

			expect(await copyButton.isVisible()).toBe(true);
			expect(await refreshButton.isVisible()).toBe(true);
		});
	});
});
