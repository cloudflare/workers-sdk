import { beforeEach, describe, test } from "vitest";
import {
	cleanupFlags,
	navigateToFlagshipApp,
	page,
	seedFlag,
	waitForBreadcrumbText,
	waitForSelector,
	waitForText,
} from "../utils";

const APP_ID = "e2e-flags";

const BOOLEAN_FLAG = {
	key: "new-checkout",
	default_variation: "off",
	enabled: true,
	variations: { off: false, on: true },
};

/**
 * Locate the table row for a flag.
 *
 * @param flagKey The flag key.
 * @returns A locator for the row.
 */
function flagRow(flagKey: string) {
	return page.locator("tr").filter({ hasText: flagKey }).first();
}

/**
 * Open the create-flag dialog from the breadcrumb action.
 */
async function openCreateDialog(): Promise<void> {
	await page.getByRole("button", { name: "Create flag" }).first().click();
	await waitForSelector('[role="dialog"]', { timeout: 5_000 });
}

describe("Flagship", () => {
	beforeEach(async () => {
		await cleanupFlags(APP_ID);
	});

	describe("flag list", () => {
		test("displays the app page with breadcrumbs", async () => {
			await navigateToFlagshipApp(APP_ID);

			await waitForBreadcrumbText("Flagship");
			await waitForBreadcrumbText(APP_ID);
		});

		test("shows empty state when the store has no flags", async () => {
			await navigateToFlagshipApp(APP_ID);

			await waitForText("No feature flags yet");
			await waitForText("wrangler flagship flags pull");
		});

		test("lists a seeded flag with its type and default variation", async () => {
			await seedFlag(APP_ID, BOOLEAN_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(BOOLEAN_FLAG.key);
			await waitForText("Boolean");
			await waitForText("off");
			await waitForText("Enabled");
		});
	});

	describe("creating flags", () => {
		test("creates a flag from the dialog and lists it", async () => {
			await navigateToFlagshipApp(APP_ID);

			await openCreateDialog();

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-key").fill("created-in-ui");
			await dialog.getByRole("button", { name: "Continue" }).click();
			await dialog.getByRole("button", { name: "Create flag" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 10_000,
			});

			await waitForText("created-in-ui", { timeout: 10_000 });
			await waitForText("Boolean");
		});

		test("creates a string flag from edited variations", async () => {
			await navigateToFlagshipApp(APP_ID);

			await openCreateDialog();

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-key").fill("greeting");
			await dialog.getByRole("button", { name: "Continue" }).click();

			await dialog.getByRole("tab", { name: "String" }).click();
			await dialog.getByLabel("Value for blue").fill("hey");
			await dialog.getByLabel("Label for blue").fill("casual");
			await dialog.getByLabel("Value for red").fill("good day");
			await dialog.getByLabel("Label for red").fill("formal");
			await dialog.locator('input[name="default-variation"]').nth(1).check();
			await dialog.getByRole("button", { name: "Create flag" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 10_000,
			});

			await waitForText("greeting", { timeout: 10_000 });
			await waitForText("String");
			await waitForText("formal");
		});

		test("rejects variations that are not valid JSON", async () => {
			await navigateToFlagshipApp(APP_ID);

			await openCreateDialog();

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-key").fill("broken");
			await dialog.getByRole("button", { name: "Continue" }).click();

			await dialog.getByRole("tab", { name: "JSON" }).click();
			await dialog.getByLabel("Value for dark").fill("not-json");
			await dialog.getByRole("button", { name: "Create flag" }).click();

			await waitForText("JSON values must be valid JSON");
			await waitForSelector('[role="dialog"]');
		});

		test("surfaces a duplicate-key error", async () => {
			await seedFlag(APP_ID, BOOLEAN_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await openCreateDialog();

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-key").fill(BOOLEAN_FLAG.key);
			await dialog.getByRole("button", { name: "Continue" }).click();

			await waitForText(
				"A flag with this key already exists in this application."
			);
		});

		test("closes the dialog on cancel without creating", async ({ expect }) => {
			await navigateToFlagshipApp(APP_ID);

			await openCreateDialog();

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-key").fill("abandoned");
			await dialog.getByRole("button", { name: "Cancel" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});

			await waitForText("No feature flags yet");
			expect(await page.getByText("abandoned").isVisible()).toBe(false);
		});
	});

	describe("toggling flags", () => {
		test("disables a flag and the change survives a reload", async () => {
			await seedFlag(APP_ID, BOOLEAN_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(BOOLEAN_FLAG.key);

			await flagRow(BOOLEAN_FLAG.key)
				.getByRole("button", { name: "Actions" })
				.click();
			await page.getByRole("menuitem", { name: "Disable" }).click();

			await waitForText("Disabled", { timeout: 10_000 });

			await navigateToFlagshipApp(APP_ID);
			await waitForText(BOOLEAN_FLAG.key);
			await waitForText("Disabled");
		});
	});

	describe("evaluating flags", () => {
		test("shows the value and reason a Worker would receive", async () => {
			await seedFlag(APP_ID, BOOLEAN_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(BOOLEAN_FLAG.key);

			await flagRow(BOOLEAN_FLAG.key)
				.getByRole("button", { name: "Actions" })
				.click();
			await page.getByRole("menuitem", { name: "Test flag" }).click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Evaluate" })
				.click();

			await waitForText("false", { timeout: 10_000 });
			await waitForText("DEFAULT");
		});
	});
});
