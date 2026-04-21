import { beforeEach, describe, test } from "vitest";
import {
	clickButton,
	fillByPlaceholder,
	getTableRowCount,
	isTextVisible,
	navigateToKV,
	page,
	seedKV,
	waitForSelector,
	waitForTableRows,
	waitForText,
} from "../utils";

describe("KV Namespace", () => {
	beforeEach(async () => {
		await seedKV();
	});

	describe("viewing entries", () => {
		test("displays entries in the table", async ({ expect }) => {
			await navigateToKV("KV");
			await waitForTableRows(5);
			await waitForText("greeting");

			const greetingRow = page.locator("tr").filter({ hasText: "greeting" });
			const rowText = await greetingRow.textContent();
			expect(rowText).toContain("Hello, World!");
		});

		test("loads namespace values when aggregate payload exceeds bulk limit", async () => {
			await navigateToKV("KV");
			await waitForTableRows(5);
			await waitForText("large-key-1");
		});

		test("shows column headers", async () => {
			await navigateToKV("KV");
			await waitForTableRows(1);

			await waitForText("Key");
			await waitForText("Value");
		});
	});

	describe("searching entries", () => {
		test("filters entries by prefix", async ({ expect }) => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			await fillByPlaceholder("Search keys by prefix...", "config:");
			await clickButton("Search");

			await waitForText("config:theme");

			const configRows = page.locator("tr").filter({ hasText: "config:" });
			const count = await configRows.count();
			expect(count).toEqual(5);
		});

		test("shows no results message when prefix matches nothing", async () => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			await fillByPlaceholder(
				"Search keys by prefix...",
				"nonexistent-prefix-xyz:"
			);
			await clickButton("Search");

			await waitForText("No keys found matching prefix");
		});
	});

	describe("adding entries", () => {
		test("adds a new key/value pair", async ({ expect }) => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const mockData = {
				key: `test-new-key-e2e-${Date.now()}`,
				value: `test-new-value-e2e-${Date.now()}`,
			};

			await page.locator("#add-key").fill(mockData.key);
			await page.locator("#add-value").fill(mockData.value);
			await clickButton("Add entry");

			await page.waitForTimeout(500);

			// Verify the new entry appears in the table (new entries are prepended at the top)
			await waitForText(mockData.key, { timeout: 15_000 });

			const newRow = page.locator("tr").filter({ hasText: mockData.key });
			const rowText = await newRow.textContent();
			expect(rowText).toContain(mockData.value);
		});

		test("shows overwrite confirmation when key exists", async () => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			await page.locator("#add-key").fill("greeting");
			await page.locator("#add-value").fill("new-greeting-value");
			await clickButton("Add entry");

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await waitForText("Overwrite key?");
		});

		test("confirms overwrite and updates value", async () => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const mockValue = "overwritten-value-e2e";

			await page.locator("#add-key").fill("greeting");
			await page.locator("#add-value").fill(mockValue);
			await clickButton("Add entry");

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Overwrite" })
				.click();

			await waitForText(mockValue);
		});
	});

	describe("editing entries", () => {
		test("opens edit mode via menu", async () => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const row = page.locator("tr").filter({ hasText: "greeting" });
			await row.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Edit" }).click();

			await waitForSelector('input[id^="edit-key-"]', { timeout: 5_000 });
		});

		test("saves edited value", async () => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const row = page.locator("tr").filter({ hasText: "greeting" });
			await row.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Edit" }).click();

			await waitForSelector('textarea[id^="edit-value-"]', { timeout: 5_000 });

			const updatedMockValue = "Updated greeting e2e";

			const valueInput = page.locator('textarea[id^="edit-value-"]');
			await valueInput.fill(updatedMockValue);
			await clickButton("Save");

			await waitForText(updatedMockValue);
		});

		test("cancels editing without saving changes", async ({ expect }) => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const row = page.locator("tr").filter({ hasText: "greeting" });
			await row.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Edit" }).click();

			await waitForSelector('textarea[id^="edit-value-"]', { timeout: 5_000 });

			const valueInput = page.locator('textarea[id^="edit-value-"]');
			await valueInput.fill("Should not be saved");
			await clickButton("Cancel");

			// Original value should still be there
			const greetingRow = page.locator("tr").filter({ hasText: "greeting" });
			const rowText = await greetingRow.textContent();
			expect(rowText).toContain("Hello, World!");
		});
	});

	describe("deleting entries", () => {
		test("shows delete confirmation dialog", async () => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const row = page.locator("tr").filter({ hasText: "greeting" });
			await row.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Delete" }).click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await waitForText("Delete key?");
		});

		test("deletes entry after confirmation", async ({ expect }) => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const row = page.locator("tr").filter({ hasText: "counter" });
			await row.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Delete" }).click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Delete" })
				.click();

			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});

			const counterCode = page.locator("code").filter({ hasText: "counter" });
			const count = await counterCode.count();
			expect(count).toBe(0);
		});

		test("cancels deletion when clicking 'Cancel'", async ({ expect }) => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const row = page.locator("tr").filter({ hasText: "greeting" });
			await row.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Delete" }).click();

			await waitForSelector('[role="dialog"]', { timeout: 5_000 });
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Cancel" })
				.click();

			const isVisible = await isTextVisible("greeting");
			expect(isVisible).toBe(true);
		});
	});

	describe("pagination", () => {
		test("loads more entries when clicking Load More", async ({ expect }) => {
			await navigateToKV("KV");
			await waitForTableRows(5);

			const initialRows = await getTableRowCount();

			const loadMoreButton = page.getByRole("button", { name: "Load More" });
			if (!(await loadMoreButton.isVisible())) {
				return;
			}

			await loadMoreButton.click();

			await page.waitForFunction(
				(prevCount: number) => {
					const rows = document.querySelectorAll("tbody tr");
					return rows.length > prevCount;
				},
				initialRows,
				{ timeout: 10_000 }
			);

			const newRows = await getTableRowCount();
			expect(newRows).toBeGreaterThan(initialRows);
		});
	});
});
