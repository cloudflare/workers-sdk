import { beforeEach, describe, test } from "vitest";
import {
	cleanupFlags,
	fetchFlag,
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
const STRING_FLAG = {
	key: "pricing-experiment",
	default_variation: "control",
	enabled: true,
	variations: { control: "blue", treatment: "red" },
};
const RULED_FLAG = {
	...STRING_FLAG,
	key: "ruled-flag",
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

function flagRow(flagKey: string) {
	return page.locator("tr").filter({ hasText: flagKey }).first();
}

async function openCreateDialog(): Promise<void> {
	await page.getByRole("button", { name: "Create flag" }).first().click();
	await waitForSelector('[role="dialog"]');
}

async function openAction(flagKey: string, action: string): Promise<void> {
	await flagRow(flagKey).getByRole("button", { name: "Row actions" }).click();
	await page.getByRole("menuitem", { name: action }).click();
}

async function openEditDialog(flagKey: string): Promise<void> {
	await openAction(flagKey, "Edit");
	await waitForSelector('[role="dialog"]');
}

async function chooseOption(name: string, option: string): Promise<void> {
	await page.getByRole("combobox", { name }).click();
	await page.getByRole("option", { name: option }).click();
}

async function saveFlag(): Promise<void> {
	await page.getByRole("button", { name: "Save changes" }).click();
	await page.waitForSelector('[role="dialog"]', {
		state: "hidden",
		timeout: 10_000,
	});
}

describe("Flagship", () => {
	beforeEach(async () => cleanupFlags(APP_ID));

	test("shows app identity and the empty state", async () => {
		await navigateToFlagshipApp(APP_ID);
		await waitForBreadcrumbText("Flagship");
		await waitForBreadcrumbText(APP_ID);
		await waitForText("No feature flags found");
		await waitForText("wrangler flagship flags pull");
	});

	test("searches, sorts, and toggles flags", async ({ expect }) => {
		await seedFlag(APP_ID, BOOLEAN_FLAG);
		await seedFlag(APP_ID, STRING_FLAG);
		await navigateToFlagshipApp(APP_ID);
		await waitForText(BOOLEAN_FLAG.key);

		await page.getByRole("button", { name: "Flag key" }).click();
		expect(await page.locator("tbody tr code").allTextContents()).toEqual([
			BOOLEAN_FLAG.key,
			STRING_FLAG.key,
		]);
		await page.getByRole("button", { name: "Flag key" }).click();
		expect(await page.locator("tbody tr code").allTextContents()).toEqual([
			STRING_FLAG.key,
			BOOLEAN_FLAG.key,
		]);

		await page.getByLabel("Search flags").fill("pricing");
		await waitForText("1 of 2");
		expect(await flagRow(BOOLEAN_FLAG.key).isVisible()).toBe(false);
		await page.getByLabel("Clear search").click();

		await openAction(BOOLEAN_FLAG.key, "Disable");
		await flagRow(BOOLEAN_FLAG.key).getByText("Disabled").waitFor();
		await navigateToFlagshipApp(APP_ID);
		await flagRow(BOOLEAN_FLAG.key).getByText("Disabled").waitFor();
	});

	test("creates, edits, and deletes a flag", async ({ expect }) => {
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
		await page.waitForSelector('[role="dialog"]', { state: "hidden" });
		await waitForText("greeting");
		await waitForText("formal");

		await openEditDialog("greeting");
		await dialog.locator("#flag-description").fill("Greeting copy");
		await dialog.getByLabel("Value for formal").fill("welcome");
		await saveFlag();
		await waitForText("Greeting copy");
		expect(await fetchFlag(APP_ID, "greeting")).toMatchObject({
			description: "Greeting copy",
			default_variation: "formal",
			variations: { formal: "welcome" },
		});

		await openAction("greeting", "Delete");
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Delete" })
			.click();
		await waitForText("No feature flags found");
	});

	test("validates values before creating", async () => {
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

	test("resets an unsaved create form", async ({ expect }) => {
		await navigateToFlagshipApp(APP_ID);
		await openCreateDialog();
		const dialog = page.getByRole("dialog");
		await dialog.locator("#flag-key").fill("discarded");
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await openCreateDialog();
		expect(await dialog.locator("#flag-key").inputValue()).toBe("");
	});

	test("loads, reorders, edits, and removes targeting rules and rollouts", async ({
		expect,
	}) => {
		await seedFlag(APP_ID, RULED_FLAG);
		await navigateToFlagshipApp(APP_ID);
		await openEditDialog(RULED_FLAG.key);
		const dialog = page.getByRole("dialog");
		expect(await dialog.getByLabel("Attribute").first().inputValue()).toBe(
			"plan"
		);
		await dialog.getByText("NZ").waitFor();

		await dialog.getByRole("button", { name: "Move rule 2 up" }).click();
		await dialog
			.getByRole("button", { name: "Add percentage rollout" })
			.first()
			.click();
		await dialog.getByLabel("Rollout percentage for rule 1").fill("33.5");
		await dialog.getByLabel("Rollout attribute for rule 1").fill("userId");
		await dialog.getByRole("button", { name: "Remove rule 2" }).click();
		await saveFlag();

		expect((await fetchFlag(APP_ID, RULED_FLAG.key)).rules).toMatchObject([
			{
				priority: 1,
				serve_variation: "control",
				rollout: { percentage: 33.5, attribute: "userId" },
			},
		]);
	});

	test("creates a rule and rejects incomplete conditions", async ({
		expect,
	}) => {
		await seedFlag(APP_ID, STRING_FLAG);
		await navigateToFlagshipApp(APP_ID);
		await openEditDialog(STRING_FLAG.key);
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("button", { name: "Add rule" }).click();
		await chooseOption("Variant served by rule 1", "treatment");
		await dialog.getByRole("button", { name: "Save changes" }).click();
		await waitForText("Fix the targeting rules below.");
		expect((await fetchFlag(APP_ID, STRING_FLAG.key)).rules).toEqual([]);

		await dialog.getByLabel("Attribute").fill("plan");
		await dialog.getByLabel("Value for plan").fill("pro");
		await saveFlag();
		expect((await fetchFlag(APP_ID, STRING_FLAG.key)).rules).toMatchObject([
			{ conditions: [{ attribute: "plan", value: "pro" }] },
		]);
	});

	test("evaluates a flag with an ad-hoc context", async () => {
		await seedFlag(APP_ID, RULED_FLAG);
		await navigateToFlagshipApp(APP_ID);
		await openAction(RULED_FLAG.key, "Test");
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("button", { name: "Add attribute" }).click();
		await dialog.getByLabel("Context key").fill("plan");
		await dialog.getByLabel("Context value").fill("pro");
		await dialog.getByRole("button", { name: "Evaluate" }).click();
		await waitForText("TARGETING_MATCH");
		await waitForText("treatment");
	});
});
