import { beforeEach, describe, test } from "vitest";
import {
	cleanupWorkflow,
	clickButton,
	isTextVisible,
	navigateToWorkflow,
	page,
	seedWorkflow,
	waitForBreadcrumbText,
	waitForSelector,
	waitForText,
} from "../utils";

const WORKFLOW_NAME = "my-workflow";

describe("Workflows", () => {
	beforeEach(async () => {
		await cleanupWorkflow(WORKFLOW_NAME);
	});

	describe("instances list", () => {
		test("displays the workflow instances page with breadcrumbs", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForBreadcrumbText("Workflows");
			await waitForBreadcrumbText(WORKFLOW_NAME);
		});

		test("shows empty state when no instances exist", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText("No instances found");
		});

		test("shows Trigger button", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			const triggerButton = page.getByRole("button", { name: "Trigger" });
			await triggerButton.waitFor({ state: "visible", timeout: 10_000 });
		});

		test("shows status filter dropdown", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			const filterButton = page
				.getByRole("button")
				.filter({ hasText: "All" })
				.first();
			await filterButton.waitFor({ state: "visible", timeout: 10_000 });
		});

		test("shows Refresh button", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			const refreshButton = page.getByRole("button", { name: "Refresh" });
			await refreshButton.waitFor({ state: "visible", timeout: 10_000 });
		});

		test("shows instances after seeding", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });
		});

		test("shows status summary bar when instances exist", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			await waitForText("Complete");
		});
	});

	describe("triggering instances", () => {
		test("opens trigger dialog via 'Trigger' button", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			await clickButton("Trigger");

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await waitForText("Trigger this workflow?");
		});

		test("triggers a new instance with params", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			await clickButton("Trigger");
			await waitForSelector('[role="dialog"]', { timeout: 5_000 });

			const dialog = page.getByRole("dialog");
			const paramsInput = dialog.locator("textarea");
			await paramsInput.fill(JSON.stringify({ name: "Triggered Test" }));

			await dialog.getByRole("button", { name: "Trigger Instance" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 10_000,
			});
		});

		test("cancels the trigger dialog", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			await clickButton("Trigger");
			await waitForSelector('[role="dialog"]', { timeout: 5_000 });

			const dialog = page.getByRole("dialog");
			await dialog.getByRole("button", { name: "Cancel" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});
		});

		test("shows validation error for invalid JSON params", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			await clickButton("Trigger");
			await waitForSelector('[role="dialog"]', { timeout: 5_000 });

			const dialog = page.getByRole("dialog");
			const paramsInput = dialog.locator("textarea");
			await paramsInput.fill("not-valid-json");

			await dialog.getByRole("button", { name: "Trigger Instance" }).click();

			await waitForText("Invalid JSON");
		});
	});

	describe("instance actions (list page)", () => {
		test("deletes an instance via delete button with confirmation", async ({
			expect,
		}) => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 15_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.locator('button[title="Delete"]').click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await waitForText("Delete this instance?");

			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Delete Instance" })
				.click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 10_000,
			});

			const isInstanceVisible = await isTextVisible(workflow.id);
			expect(isInstanceVisible).toBe(false);
		});

		test("cancels delete confirmation dialog", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 15_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.locator('button[title="Delete"]').click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });

			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Cancel" })
				.click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});
		});
	});

	describe("instance detail page", () => {
		test("navigates to instance detail from list", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForText("Steps Completed", { timeout: 10_000 });
		});

		test("shows stats strip on detail page", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForText("Status", { timeout: 10_000 });
			await waitForText("Steps Completed");
			await waitForText("Duration");
		});

		test("shows input params section", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForText("Input params", { timeout: 10_000 });
		});

		test("shows 'Output' section", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForText("Output", { timeout: 10_000 });
		});

		test("shows step history", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForText("Step History", { timeout: 10_000 });
		});

		test("shows step names after workflow completes", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForText("Step History", { timeout: 10_000 });

			await waitForText("greet", { timeout: 10_000 });
		});

		test("shows delete confirmation dialog on detail page", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForText("Step History", { timeout: 10_000 });

			await page.locator('button[title="Delete"]').click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await waitForText("Delete this instance?");
		});

		test("breadcrumbs show workflow name and instance ID", async () => {
			const workflow = await seedWorkflow(WORKFLOW_NAME);
			await navigateToWorkflow(WORKFLOW_NAME);

			await waitForText(workflow.id, { timeout: 10_000 });

			const instanceRow = page
				.locator("div.border-b")
				.filter({ hasText: workflow.id })
				.first();
			await instanceRow.click();

			await waitForBreadcrumbText("Workflows", { timeout: 10_000 });
			await waitForBreadcrumbText(WORKFLOW_NAME, { timeout: 10_000 });
		});
	});

	describe("status filter", () => {
		test("opens status filter dropdown", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			const filterButton = page
				.getByRole("button")
				.filter({ hasText: "All" })
				.first();
			await filterButton.waitFor({ state: "visible", timeout: 10_000 });
			await filterButton.click();

			await waitForText("Queued");
			await waitForText("Running");
			await waitForText("Complete");
		});
	});

	describe("delete all instances", () => {
		test("opens delete all dialog from more actions menu", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			const moreActionsButton = page.getByRole("button", {
				name: "More actions",
			});
			await moreActionsButton.waitFor({
				state: "visible",
				timeout: 10_000,
			});
			await moreActionsButton.click();

			await waitForText("Delete all instances");
			await page.getByText("Delete all instances").click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await waitForText("Delete all instances");
		});

		test("cancels delete all dialog", async () => {
			await navigateToWorkflow(WORKFLOW_NAME);

			const moreActionsButton = page.getByRole("button", {
				name: "More actions",
			});
			await moreActionsButton.waitFor({
				state: "visible",
				timeout: 10_000,
			});
			await moreActionsButton.click();

			await waitForText("Delete all instances");
			await page.getByText("Delete all instances").click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });

			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Cancel" })
				.click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});
		});
	});
});
