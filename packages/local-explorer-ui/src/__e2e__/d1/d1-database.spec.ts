import { beforeEach, describe, test } from "vitest";
import {
	clickButton,
	isTextVisible,
	navigateToD1,
	openTableSelector,
	page,
	refreshTables,
	runAllQueries,
	runQuery,
	seedD1,
	typeInQueryEditor,
	waitForDialog,
	waitForQueryEditor,
	waitForQueryResult,
	waitForTableRows,
	waitForText,
} from "../utils";

describe("D1 Database Studio", () => {
	beforeEach(async () => {
		await seedD1();
	});

	describe("table list", () => {
		test("displays available tables in the selector", async ({ expect }) => {
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
			const usersOption = page.getByRole("menuitem", { name: "users" });
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
		test("can click 'Add row' button", async ({ expect }) => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			const isAddRowVisible = await isTextVisible("Add row");
			expect(isAddRowVisible).toBe(true);

			await clickButton("Add row");

			// After clicking, the table should still be visible
			await waitForTableRows(1);
		});

		test("shows 'Commit' button after making changes", async ({ expect }) => {
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

		test("discards changes when clicking 'Discard'", async ({ expect }) => {
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
		test("'Edit Schema' button is visible when table selected", async ({
			expect,
		}) => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			const editSchemaButton = page.getByRole("button", {
				name: /Edit (table )?Schema/i,
			});
			const isEditSchemaVisible = await editSchemaButton.isVisible();
			expect(isEditSchemaVisible).toBe(true);
		});

		test("'Delete Table' button is visible when table selected", async ({
			expect,
		}) => {
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			const deleteTableButton = page.getByRole("button", {
				name: /Delete (T|t)able/i,
			});
			const isDeleteTableVisible = await deleteTableButton.isVisible();
			expect(isDeleteTableVisible).toBe(true);
		});

		test("shows confirmation when deleting table", async ({ expect }) => {
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
		test("refresh button is visible", async ({ expect }) => {
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

	describe("SQL queries", () => {
		test("creates a table via SQL", async ({ expect }) => {
			await navigateToD1("DB");
			await waitForText("D1");
			await waitForQueryEditor();

			await typeInQueryEditor(`
				DROP TABLE IF EXISTS products;
				CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
			`);
			await runAllQueries();
			await waitForQueryResult();

			await refreshTables();

			await openTableSelector();

			const productsOption = page.getByRole("menuitem", {
				name: "products",
			});
			const isProductsVisible = await productsOption.isVisible();
			expect(isProductsVisible).toBe(true);
		});

		test("inserts a row via SQL", async () => {
			await navigateToD1("DB");
			await waitForText("D1");
			await waitForQueryEditor();

			await typeInQueryEditor(
				"INSERT INTO users (id, name) VALUES (3, 'Charlie');"
			);
			await runQuery();
			await waitForQueryResult();

			// Navigate to the users table and verify `Charlie` appears
			await navigateToD1("DB", "users");
			await waitForTableRows(1);
			await waitForText("Charlie");
		});

		test("deletes a row via SQL", async ({ expect }) => {
			await navigateToD1("DB");
			await waitForText("D1");
			await waitForQueryEditor();

			await typeInQueryEditor("DELETE FROM users WHERE name = 'Bob';");
			await runQuery();
			await waitForQueryResult();

			// Navigate to the users table and verify `Bob` is gone
			await navigateToD1("DB", "users");
			await waitForTableRows(1);

			await waitForText("Alice");

			const isBobVisible = await isTextVisible("Bob");
			expect(isBobVisible).toBe(false);
		});

		test("adds a column via SQL", async () => {
			await navigateToD1("DB");
			await waitForText("D1");
			await waitForQueryEditor();

			await typeInQueryEditor("ALTER TABLE users ADD COLUMN email TEXT;");
			await runQuery();
			await waitForQueryResult();

			await navigateToD1("DB", "users");
			await waitForTableRows(1);
			await waitForText("email");
		});

		test("executes a SELECT query and displays results", async () => {
			await navigateToD1("DB");
			await waitForText("D1");
			await waitForQueryEditor();

			await typeInQueryEditor("SELECT * FROM users;");
			await runQuery();
			await waitForQueryResult();

			// The result tab should show the table name and dimensions
			// e.g., "users • 2 x 2" (2 columns x 2 rows)
			await waitForText("users");

			// Verify both rows appear in the results
			await waitForText("Alice");
			await waitForText("Bob");
		});
	});
});
