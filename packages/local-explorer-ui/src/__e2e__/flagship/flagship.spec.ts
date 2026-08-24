import { beforeEach, describe, test } from "vitest";
import {
	cleanupFlags,
	navigateToFlagshipApp,
	page,
	fetchFlag,
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

function flagRow(flagKey: string) {
	return page.locator("tr").filter({ hasText: flagKey }).first();
}

async function openCreateDialog(): Promise<void> {
	await page.getByRole("button", { name: "Create flag" }).first().click();
	await waitForSelector('[role="dialog"]', { timeout: 5_000 });
}

async function openEditDialog(flagKey: string): Promise<void> {
	await flagRow(flagKey).getByRole("button", { name: "Row actions" }).click();
	await page.getByRole("menuitem", { name: "Edit" }).click();
	await waitForSelector('[role="dialog"]', { timeout: 5_000 });
}

const STRING_FLAG = {
	key: "pricing-experiment",
	default_variation: "control",
	enabled: true,
	variations: { control: "blue", treatment: "red" },
};

/**
 * Waits for a JSON encoded variation value to appear in the table.
 *
 * `waitForText` builds a `text=` selector, where surrounding quotes mean "match
 * exactly", so a JSON encoded string's own quotes would be swallowed.
 */
async function waitForVariationValue(value: string): Promise<void> {
	await page.getByText(value).first().waitFor({ timeout: 10_000 });
}

/**
 * Picks an option from a Kumo `Select` identified by its accessible name.
 */
async function chooseOption(name: string, option: string): Promise<void> {
	await page.getByRole("combobox", { name }).click();
	await page.getByRole("option", { name: option }).click();
}

/**
 * Fills the first condition of a rule and the variant it serves.
 */
async function fillRule(
	ruleNumber: number,
	condition: { attribute: string; operator: string; value: string },
	serve: string
): Promise<void> {
	const dialog = page.getByRole("dialog");
	await dialog
		.getByLabel("Attribute")
		.nth(ruleNumber - 1)
		.fill(condition.attribute);
	await chooseOption("Operator", condition.operator);
	await dialog
		.getByLabel(`Value for ${condition.attribute}`)
		.fill(condition.value);
	await chooseOption(`Variant served by rule ${ruleNumber}`, serve);
}

/**
 * Saves the flag dialog and waits for it to close.
 */
async function saveFlagDialog(): Promise<void> {
	await page.getByRole("button", { name: "Save changes" }).click();
	await page.waitForSelector('[role="dialog"]', {
		state: "hidden",
		timeout: 10_000,
	});
}

const RULED_FLAG = {
	key: "ruled-flag",
	default_variation: "control",
	enabled: true,
	variations: { control: "blue", treatment: "red" },
	rules: [
		{
			priority: 1,
			conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
			serve_variation: "treatment",
		},
		{
			priority: 2,
			conditions: [
				{ attribute: "country", operator: "in", value: ["NZ", "AU"] },
			],
			serve_variation: "control",
		},
	],
};

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

			await waitForText("No feature flags found");
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

		test("filters the list from the search field", async ({ expect }) => {
			await seedFlag(APP_ID, BOOLEAN_FLAG);
			await seedFlag(APP_ID, {
				default_variation: "control",
				enabled: true,
				key: "pricing-experiment",
				variations: { control: "blue", treatment: "red" },
			});
			await navigateToFlagshipApp(APP_ID);

			await waitForText(BOOLEAN_FLAG.key);

			await page.getByLabel("Search flags").fill("pricing");

			await waitForText("1 of 2");
			expect(await flagRow(BOOLEAN_FLAG.key).isVisible()).toBe(false);

			await page.getByLabel("Search flags").fill("nothing-matches");
			await waitForText("No matching flags");
		});
	});

	describe("creating flags", () => {
		test("creates a flag from the dialog and lists it", async () => {
			await navigateToFlagshipApp(APP_ID);

			await openCreateDialog();

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-key").fill("created-in-ui");
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
			await dialog.getByRole("button", { name: "Create flag" }).click();

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

			await waitForText("No feature flags found");
			expect(await page.getByText("abandoned").isVisible()).toBe(false);
		});
	});

	describe("editing flags", () => {
		test("saves a new description and variation value", async () => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await openEditDialog(STRING_FLAG.key);

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-description").fill("Controls pricing copy");
			await dialog.getByLabel("Value for control").fill("green");
			await dialog.getByRole("button", { name: "Save changes" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 10_000,
			});

			await waitForText("Controls pricing copy", { timeout: 10_000 });
			await waitForVariationValue('"green"');
		});

		test("changes which variation is served by default", async () => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await openEditDialog(STRING_FLAG.key);

			const dialog = page.getByRole("dialog");
			await dialog.locator('input[name="default-variation"]').nth(1).check();
			await dialog.getByRole("button", { name: "Save changes" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 10_000,
			});

			await waitForText("treatment", { timeout: 10_000 });
			await waitForVariationValue('"red"');
		});

		test("does not offer the key or type for editing", async ({ expect }) => {
			await seedFlag(APP_ID, BOOLEAN_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(BOOLEAN_FLAG.key);
			await openEditDialog(BOOLEAN_FLAG.key);

			const dialog = page.getByRole("dialog");
			await waitForText("A flag's key cannot be changed.");
			expect(await dialog.locator("#flag-key").count()).toBe(0);
			expect(await dialog.getByRole("tab").count()).toBe(0);
		});

		test("closes the dialog on cancel without saving", async () => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await openEditDialog(STRING_FLAG.key);

			const dialog = page.getByRole("dialog");
			await dialog.locator("#flag-description").fill("Abandoned edit");
			await dialog.getByRole("button", { name: "Cancel" }).click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});

			await navigateToFlagshipApp(APP_ID);
			await waitForText(STRING_FLAG.key);
			await waitForVariationValue('"blue"');
		});
	});

	describe("row activation", () => {
		test("opens the edit dialog when a row is clicked", async ({ expect }) => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await flagRow(STRING_FLAG.key).click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await waitForText("A flag's key cannot be changed.");
			expect(
				await page.getByRole("dialog").getByText("Edit flag").count()
			).toBe(1);
		});

		test("opens the edit dialog from the flag key", async ({ expect }) => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await page.getByRole("button", { name: STRING_FLAG.key }).click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			expect(
				await page.getByRole("dialog").getByText("Edit flag").count()
			).toBe(1);
		});

		test("does not open the edit dialog from the row action menu", async ({
			expect,
		}) => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await flagRow(STRING_FLAG.key)
				.getByRole("button", { name: "Row actions" })
				.click();

			await page.getByRole("menuitem", { name: "Test" }).waitFor();
			expect(await page.getByText("Edit flag").count()).toBe(0);
		});
	});

	describe("targeting rules", () => {
		test("adds a targeting rule to an existing flag", async ({ expect }) => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await openEditDialog(STRING_FLAG.key);

			await page.getByRole("button", { name: "Add rule" }).click();
			await fillRule(
				1,
				{ attribute: "plan", operator: "equals", value: "pro" },
				"treatment"
			);
			await saveFlagDialog();

			const stored = await fetchFlag(APP_ID, STRING_FLAG.key);
			expect(stored.rules).toMatchObject([
				{
					priority: 1,
					serve_variation: "treatment",
					conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
				},
			]);
		});

		test("shows the stored rules when reopening the dialog", async ({
			expect,
		}) => {
			await seedFlag(APP_ID, RULED_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(RULED_FLAG.key);
			await openEditDialog(RULED_FLAG.key);

			const dialog = page.getByRole("dialog");
			await waitForText("Rule 1");
			await waitForText("Rule 2");
			expect(await dialog.getByLabel("Attribute").first().inputValue()).toBe(
				"plan"
			);
			expect(await dialog.getByLabel("Value for plan").inputValue()).toBe(
				"pro"
			);
			// List operators render their values as removable chips.
			expect(await dialog.getByText("NZ").count()).toBeGreaterThan(0);
		});

		test("reorders rules and renumbers their priorities", async ({
			expect,
		}) => {
			await seedFlag(APP_ID, RULED_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(RULED_FLAG.key);
			await openEditDialog(RULED_FLAG.key);

			await page.getByRole("button", { name: "Move rule 2 up" }).click();
			await saveFlagDialog();

			const stored = await fetchFlag(APP_ID, RULED_FLAG.key);
			expect(stored.rules).toMatchObject([
				{ priority: 1, serve_variation: "control" },
				{ priority: 2, serve_variation: "treatment" },
			]);
		});

		test("removes a rule", async ({ expect }) => {
			await seedFlag(APP_ID, RULED_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(RULED_FLAG.key);
			await openEditDialog(RULED_FLAG.key);

			await page.getByRole("button", { name: "Remove rule 1" }).click();
			await saveFlagDialog();

			const stored = await fetchFlag(APP_ID, RULED_FLAG.key);
			expect(stored.rules).toMatchObject([
				{ priority: 1, serve_variation: "control" },
			]);
		});

		test("adds a percentage rollout to a rule", async ({ expect }) => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await openEditDialog(STRING_FLAG.key);

			await page.getByRole("button", { name: "Add rule" }).click();
			await fillRule(
				1,
				{ attribute: "plan", operator: "equals", value: "pro" },
				"treatment"
			);
			await page
				.getByRole("button", { name: "Add percentage rollout" })
				.click();
			await page.getByLabel("Rollout percentage for rule 1").fill("33.5");
			await saveFlagDialog();

			const stored = await fetchFlag(APP_ID, STRING_FLAG.key);
			expect(stored.rules[0]?.rollout).toMatchObject({ percentage: 33.5 });
		});

		test("refuses to save a rule with an empty attribute", async ({
			expect,
		}) => {
			await seedFlag(APP_ID, STRING_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(STRING_FLAG.key);
			await openEditDialog(STRING_FLAG.key);

			await page.getByRole("button", { name: "Add rule" }).click();
			await chooseOption("Variant served by rule 1", "treatment");
			await page.getByRole("button", { name: "Save changes" }).click();

			await waitForText("Fix the targeting rules below.");
			expect(await page.getByRole("dialog").count()).toBe(1);
			const stored = await fetchFlag(APP_ID, STRING_FLAG.key);
			expect(stored.rules).toEqual([]);
		});
	});

	describe("toggling flags", () => {
		test("disables a flag and the change survives a reload", async () => {
			await seedFlag(APP_ID, BOOLEAN_FLAG);
			await navigateToFlagshipApp(APP_ID);

			await waitForText(BOOLEAN_FLAG.key);

			await flagRow(BOOLEAN_FLAG.key)
				.getByRole("button", { name: "Row actions" })
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
				.getByRole("button", { name: "Row actions" })
				.click();
			await page.getByRole("menuitem", { name: "Test" }).click();

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
