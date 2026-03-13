import { beforeEach, describe, expect, test } from "vitest";
import {
	clickButton,
	isTextVisible,
	navigateToD1,
	page,
	seedD1,
	waitForDialog,
	waitForTableRows,
	waitForText,
} from "../utils";

describe("D1 Database Studio", () => {
	beforeEach(async () => {
		await seedD1();
	});

	describe("table list", () => {
		test("displays available tables in the selector", async () => {
			await navigateToD1("DB");
			await waitForText("D1");

			const selectTableButton = page.getByRole("button", {
				name: /Select a table|users/i,
			});

			if (!(await selectTableButton.isVisible())) {
				return;
			}

			await selectTableButton.click();

			// Should show the users table from seed data
			const usersOption = page.getByRole("option", { name: "users" });
			const isUsersVisible = await usersOption.isVisible();
			expect(isUsersVisible).toBe(true);
		});
	});

	describe("table explorer", () => {
		test("displays table data when table is selected", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			await waitForText("Alice");
			await waitForText("Bob");
		});

		test("shows table structure with `id` and `name` columns", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			await waitForText("id");
			await waitForText("name");
		});
	});

	describe("row operations", () => {
		test("can click 'Add row' button", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			const isAddRowVisible = await isTextVisible("Add row");
			expect(isAddRowVisible).toBe(true);

			await clickButton("Add row");

			// After clicking, the table should still be visible
			await waitForTableRows(1);
		});

		test("shows 'Commit' button after making changes", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(2);

			await clickButton("Add row");

			// Wait for the state to update - the Commit/Discard buttons appear when changes exist
			await page.waitForTimeout(500);

			const commitButton = page.getByRole("button", {
				name: /Commit|Delete \d+ row/i,
			});
			const isCommitVisible = await commitButton.isVisible();
			expect(isCommitVisible).toBe(true);

			const isDiscardVisible = await isTextVisible("Discard");
			expect(isDiscardVisible).toBe(true);
		});

		test("discards changes when clicking 'Discard'", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(2);

			await clickButton("Add row");
			await clickButton("Discard");

			// After discard, the Commit/Discard buttons should disappear
			await page.waitForTimeout(500);
			const commitButton = page.getByRole("button", { name: /Commit/i });
			const isVisible = await commitButton.isVisible().catch(() => false);
			expect(isVisible).toBe(false);
		});
	});

	describe("table schema management", () => {
		test("'Edit Schema' button is visible when table selected", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			const editSchemaButton = page.getByRole("button", {
				name: /Edit (table )?Schema/i,
			});
			const isEditSchemaVisible = await editSchemaButton.isVisible();
			expect(isEditSchemaVisible).toBe(true);
		});

		test("'Delete Table' button is visible when table selected", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			const deleteTableButton = page.getByRole("button", {
				name: /Delete (T|t)able/i,
			});
			const isDeleteTableVisible = await deleteTableButton.isVisible();
			expect(isDeleteTableVisible).toBe(true);
		});

		test("shows confirmation when deleting table", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			await page.getByRole("button", { name: /Delete (T|t)able/i }).click();

			await waitForDialog();

			const dialog = page.getByRole("dialog");
			const dialogText = await dialog.textContent();
			expect(dialogText).toContain("users");
		});
	});

	describe("refresh functionality", () => {
		test("refresh button is visible", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			const refreshButton = page.getByRole("button", {
				name: "Refresh tables",
			});
			const isRefreshVisible = await refreshButton.isVisible();
			expect(isRefreshVisible).toBe(true);
		});
	});

	describe("navigation", () => {
		test("breadcrumbs show D1 and database ID", async () => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			// Breadcrumbs should show D1 and the database ID
			await waitForText("D1");
			await waitForText("DB");
		});
	});
});
