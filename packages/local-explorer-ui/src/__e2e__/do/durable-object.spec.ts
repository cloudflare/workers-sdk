import { beforeEach, describe, test } from "vitest";
import {
	isTextVisible,
	navigateToDOClass,
	navigateToDOObject,
	navigateToDOObjectByName,
	openTableSelector,
	page,
	refreshTables,
	runAllQueries,
	runQuery,
	seedDO,
	typeInQueryEditor,
	waitForQueryEditor,
	waitForQueryResult,
	waitForTableRows,
	waitForText,
} from "../utils";

describe("Durable Objects", () => {
	beforeEach(async () => {
		await seedDO("test-object");
	});

	describe("class listing", () => {
		test("displays DO class page", async () => {
			await navigateToDOClass("MyDurableObject");

			// Should show the class name in breadcrumbs
			await waitForText("MyDurableObject");
			await waitForText("Durable Objects");
		});

		test("shows 'Object ID' header in table", async () => {
			await navigateToDOClass("MyDurableObject");

			// The table should have an 'Object ID' column
			await waitForText("Object ID");
		});

		test("shows Open Studio link for objects if they exist", async ({
			expect,
		}) => {
			await navigateToDOClass("MyDurableObject");
			await waitForText("MyDurableObject");

			await page.waitForTimeout(1_000);

			const openStudioLinks = page.locator('a:has-text("Open Studio")');
			const count = await openStudioLinks.count();
			expect(count).toBeGreaterThanOrEqual(1);
		});
	});

	describe("empty state", () => {
		test("shows message when no DO objects exist or shows objects", async ({
			expect,
		}) => {
			await navigateToDOClass("MyDurableObject");

			await page.waitForTimeout(1_000);

			const hasEmptyMessage = await isTextVisible(
				"No Durable Objects with stored data"
			);
			const hasObjectIdHeader = await isTextVisible("Object ID");
			const hasOpenStudioLink = await page
				.locator('a:has-text("Open Studio")')
				.first()
				.isVisible()
				.catch(() => false);

			expect(hasEmptyMessage || hasObjectIdHeader || hasOpenStudioLink).toBe(
				true
			);
		});
	});

	describe("navigation", () => {
		test("breadcrumbs show DO and class name", async () => {
			await navigateToDOClass("MyDurableObject");

			// Breadcrumbs should show the navigation path
			await waitForText("Durable Objects");
			await waitForText("MyDurableObject");
		});
	});

	describe("SQL queries", () => {
		test("creates a table via SQL", async ({ expect }) => {
			await navigateToDOObjectByName("MyDurableObject");
			await waitForText("Durable Objects");
			await waitForQueryEditor();

			await typeInQueryEditor(`
				DROP TABLE IF EXISTS products;
				CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
			`);
			await runAllQueries();
			await waitForQueryResult();

			await refreshTables();

			await openTableSelector();

			const productsOption = page.getByRole("option", { name: "products" });
			const isProductsVisible = await productsOption.isVisible();
			expect(isProductsVisible).toBe(true);
		});

		test("inserts a row via SQL", async () => {
			const objectId = await navigateToDOObjectByName("MyDurableObject");
			await waitForText("Durable Objects");
			await waitForQueryEditor();

			await typeInQueryEditor(
				"INSERT INTO users (id, name) VALUES (3, 'Charlie');"
			);
			await runQuery();
			await waitForQueryResult();

			await navigateToDOObject("MyDurableObject", objectId, "users");
			await waitForTableRows(1);
			await waitForText("Charlie");
		});

		test("deletes a row via SQL", async ({ expect }) => {
			const objectId = await navigateToDOObjectByName("MyDurableObject");
			await waitForText("Durable Objects");
			await waitForQueryEditor();

			await typeInQueryEditor("DELETE FROM users WHERE name = 'Bob';");
			await runQuery();
			await waitForQueryResult();

			await navigateToDOObject("MyDurableObject", objectId, "users");
			await waitForTableRows(1);

			await waitForText("Alice");

			const isBobVisible = await isTextVisible("Bob");
			expect(isBobVisible).toBe(false);
		});

		test("adds a column via SQL", async () => {
			const objectId = await navigateToDOObjectByName("MyDurableObject");
			await waitForText("Durable Objects");
			await waitForQueryEditor();

			await typeInQueryEditor("ALTER TABLE users ADD COLUMN email TEXT;");
			await runQuery();
			await waitForQueryResult();

			await navigateToDOObject("MyDurableObject", objectId, "users");
			await waitForTableRows(1);
			await waitForText("email");
		});

		test("executes a SELECT query and displays results", async () => {
			await navigateToDOObjectByName("MyDurableObject");
			await waitForText("Durable Objects");
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
