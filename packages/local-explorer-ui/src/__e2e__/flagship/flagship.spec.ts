import { beforeEach, describe, test } from "vitest";
import {
	LOCAL_EXPLORER_API_PATH,
	LOCAL_EXPLORER_BASE_PATH,
} from "../../constants";
import { viteUrl, workerUrl } from "../setup";
import {
	page,
	waitForBreadcrumbText,
	waitForSelector,
	waitForText,
} from "../utils";

const APP_ID = "e2e-flags";
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

interface FlagResult {
	default_variation: string;
	description?: string | null;
	key: string;
	rules: Array<{
		conditions: unknown[];
		priority: number;
		rollout?: { attribute?: string; percentage: number };
		serve_variation: string;
	}>;
	variations: Record<string, unknown>;
}

function flagsUrl(): string {
	return `${workerUrl}${LOCAL_EXPLORER_API_PATH}/flagship/apps/${APP_ID}/flags`;
}

async function listFlags(): Promise<FlagResult[]> {
	const response = await fetch(flagsUrl());
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return ((await response.json()) as { result: FlagResult[] }).result;
}

async function seedFlag(flag: { key: string } & Record<string, unknown>) {
	const response = await fetch(flagsUrl(), {
		body: JSON.stringify(flag),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
}

async function fetchFlag(flagKey: string): Promise<FlagResult> {
	const flag = (await listFlags()).find(({ key }) => key === flagKey);
	if (flag === undefined) {
		throw new Error(`Flag '${flagKey}' was not found`);
	}
	return flag;
}

async function cleanupFlags(): Promise<void> {
	await Promise.all(
		(await listFlags()).map(({ key }) =>
			fetch(`${flagsUrl()}/${key}`, { method: "DELETE" })
		)
	);
}

async function navigateToFlagshipApp(): Promise<void> {
	await page.goto(
		new URL(
			`${LOCAL_EXPLORER_BASE_PATH}/flagship/${APP_ID}`,
			viteUrl
		).toString()
	);
	await page.waitForLoadState("domcontentloaded");
}

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

async function saveFlag(): Promise<void> {
	await page.getByRole("button", { name: "Save changes" }).click();
	try {
		await page.waitForSelector('[role="dialog"]', {
			state: "hidden",
			timeout: 10_000,
		});
	} catch (error) {
		const messages = await page
			.getByRole("dialog")
			.getByRole("alert")
			.allTextContents();
		throw new Error(`Flag dialog did not close: ${messages.join("; ")}`, {
			cause: error,
		});
	}
}

describe("Flagship", () => {
	beforeEach(cleanupFlags);

	test("creates, edits, and deletes a flag", async ({ expect }) => {
		await navigateToFlagshipApp();
		await waitForBreadcrumbText("Flagship");
		await waitForBreadcrumbText(APP_ID);
		await waitForText("No feature flags found");
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
		expect(await fetchFlag("greeting")).toMatchObject({
			description: "Greeting copy",
			default_variation: "formal",
			variations: { formal: "welcome" },
		});
		await openAction("greeting", "Disable");
		await flagRow("greeting").getByText("Disabled").waitFor();

		await openAction("greeting", "Delete");
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Delete" })
			.click();
		await waitForText("No feature flags found");
	});

	test("edits targeting rules and rollouts", async ({ expect }) => {
		await seedFlag(RULED_FLAG);
		await navigateToFlagshipApp();
		await openEditDialog(RULED_FLAG.key);
		const dialog = page.getByRole("dialog");
		const firstRule = dialog.getByRole("region", { name: "Rule 1" });
		await dialog.getByLabel("Label for treatment").fill("experiment");
		await firstRule.getByRole("button", { name: "OR condition" }).click();
		await firstRule
			.getByLabel("Attribute", { exact: true })
			.nth(1)
			.fill("country");
		await firstRule.getByLabel("Value", { exact: true }).nth(1).fill("NZ");
		await firstRule
			.getByRole("button", { name: "Add percentage rollout" })
			.click();
		await firstRule.getByLabel("Rollout percentage").fill("33.5");
		await firstRule.getByLabel("Rollout attribute").fill("userId");
		await dialog.getByRole("button", { name: "Delete rule 2" }).click();
		await saveFlag();

		expect((await fetchFlag(RULED_FLAG.key)).rules).toMatchObject([
			{
				priority: 1,
				conditions: [
					{
						logical_operator: "OR",
						clauses: [
							{ attribute: "plan", operator: "equals", value: "pro" },
							{ attribute: "country", operator: "equals", value: "NZ" },
						],
					},
				],
				serve_variation: "experiment",
				rollout: { percentage: 33.5, attribute: "userId" },
			},
		]);
	});

	test("serves a percentage split when no rule matches", async ({ expect }) => {
		await seedFlag(STRING_FLAG);
		await navigateToFlagshipApp();
		await openEditDialog(STRING_FLAG.key);
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("When no rules match, serve").click();
		await page.getByRole("option", { name: "a percentage split" }).click();
		await dialog.getByLabel("Percentage for control").fill("70");
		await dialog.getByLabel("Percentage for treatment").fill("30");
		await dialog.getByLabel("Targeting key").fill("userId");
		await saveFlag();

		expect((await fetchFlag(STRING_FLAG.key)).rules).toMatchObject([
			{
				priority: 1,
				conditions: [],
				serve_variation: "treatment",
				rollout: { percentage: 30, attribute: "userId" },
			},
		]);
	});

	test("evaluates a flag with an ad-hoc context", async () => {
		await seedFlag(RULED_FLAG);
		await navigateToFlagshipApp();
		await openAction(RULED_FLAG.key, "Test");
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("button", { name: "Add attribute" }).click();
		await dialog.getByLabel("Context attribute").fill("plan");
		await dialog.getByLabel("Context value").fill("pro");
		await dialog.getByRole("button", { name: "Evaluate" }).click();
		await waitForText("TARGETING_MATCH");
		await waitForText("treatment");
	});
});
