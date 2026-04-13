import { beforeEach, describe, test } from "vitest";
import {
	captureDownload,
	cleanupDownload,
	clickButton,
	isTextVisible,
	navigateToR2Bucket,
	navigateToR2Object,
	page,
	seedR2,
	waitForBreadcrumbText,
	waitForDialog,
	waitForTableRows,
	waitForText,
} from "../utils";

describe("R2 Bucket", () => {
	beforeEach(async () => {
		await seedR2();
	});

	describe("viewing objects", () => {
		test("displays objects and directories in the table", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Column headers should be visible
			await waitForText("Objects");
			await waitForText("Type");
			await waitForText("Size");
			await waitForText("Modified");
		});

		test("shows root-level files in grouped mode", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Root-level files from seed data
			await waitForText("readme.txt");
			await waitForText("config.json");
		});

		test("shows directories in grouped mode", async ({ expect }) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Directories from seed data (grouped by delimiter "/")
			await waitForText("images/");
			await waitForText("documents/");
			await waitForText("data/");
			await waitForText("logs/");
			await waitForText("assets/");

			// Directories should show "Directory" as their type
			const directoryRow = page.locator("tr").filter({ hasText: "images/" });
			const rowText = await directoryRow.textContent();
			expect(rowText).toContain("Directory");
		});

		test("shows content type for files", async ({ expect }) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// File rows should display a MIME type in the Type column.
			// The list API may not return the stored httpMetadata so the UI
			// falls back to "application/octet-stream".
			const configRow = page.locator("tr").filter({ hasText: "config.json" });
			const rowText = await configRow.textContent();
			expect(rowText).toMatch(/application\/\w+/);
		});

		test("shows empty state when bucket has no objects", async () => {
			// Navigate to a non-existent prefix to simulate empty state
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Navigate into a prefix that doesn't exist by manipulating the URL
			await page.goto(
				`${page.url().split("/r2/")[0]}/r2/my-bucket?prefix=nonexistent-prefix/`
			);
			await page.waitForLoadState("domcontentloaded");

			await waitForText("No objects in this directory");
		});
	});

	describe("breadcrumbs and navigation", () => {
		test("shows R2 and bucket name in breadcrumbs", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			await waitForBreadcrumbText("R2");
			await waitForBreadcrumbText("my-bucket");
		});

		test("navigates into a directory and updates breadcrumbs", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Click on the "images/" directory
			const imagesButton = page
				.locator("button")
				.filter({ hasText: "images/" });
			await imagesButton.click();

			// Breadcrumbs should now include the directory
			await waitForBreadcrumbText("images");

			// Should show files inside the images directory
			await waitForText("logo.svg");
			await waitForText("banner.svg");
		});

		test("navigates into nested directories", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Navigate into "images/"
			const imagesButton = page
				.locator("button")
				.filter({ hasText: "images/" });
			await imagesButton.click();
			await waitForBreadcrumbText("images");
			await waitForText("icons/");

			// Navigate into "icons/" subdirectory
			const iconsButton = page.locator("button").filter({ hasText: "icons/" });
			await iconsButton.click();
			await waitForBreadcrumbText("icons");

			// Should show nested files
			await waitForText("home.svg");
			await waitForText("settings.svg");
		});

		test("navigates back to bucket root via breadcrumb", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Navigate into a directory
			const imagesButton = page
				.locator("button")
				.filter({ hasText: "images/" });
			await imagesButton.click();
			await waitForBreadcrumbText("images");

			// Click the bucket name breadcrumb to go back to root
			const bucketBreadcrumb = page
				.locator('nav[aria-label="breadcrumb"]')
				.getByRole("link", { name: "my-bucket" })
				.first();
			await bucketBreadcrumb.click();

			// Should be back at root showing directories
			await waitForText("images/");
			await waitForText("documents/");
		});
	});

	describe("grouped/ungrouped toggle", () => {
		test("defaults to grouped mode", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// The "Grouped" button should be visible in the toolbar
			await waitForText("Grouped");

			// Directories should be visible (grouped mode uses delimiter)
			await waitForText("images/");
		});

		test("switches to ungrouped mode and shows flat object keys", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Open the view mode dropdown
			await page.getByRole("button", { name: /Grouped|Ungrouped/ }).click();

			// Click "Ungrouped" option (exact match to avoid matching "Grouped" substring)
			await page
				.getByRole("menuitem", { name: "Ungrouped", exact: true })
				.click();

			// Wait for the page to reload with ungrouped view
			await waitForTableRows(1);

			// In ungrouped mode, full object keys should be visible (no directories)
			await waitForText("images/logo.svg");
			await waitForText("documents/report.txt");
			await waitForText("data/users.json");
		});

		test("switches back to grouped mode from ungrouped", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Switch to ungrouped
			await page.getByRole("button", { name: /Grouped|Ungrouped/ }).click();
			await page
				.getByRole("menuitem", { name: "Ungrouped", exact: true })
				.click();
			await waitForTableRows(1);

			// Switch back to grouped (exact match to avoid matching "Ungrouped")
			await page.getByRole("button", { name: /Grouped|Ungrouped/ }).click();
			await page
				.getByRole("menuitem", { name: "Grouped", exact: true })
				.click();
			await waitForTableRows(1);

			// Directories should reappear
			await waitForText("images/");
			await waitForText("documents/");
		});
	});

	describe("object detail page", () => {
		test("navigates to object detail page from table", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Click on a root-level file to navigate to its detail page
			const readmeLink = page.getByRole("link", { name: "readme.txt" }).first();
			await readmeLink.click();

			// Should show the object key as the page title
			await waitForText("readme.txt");

			// Should show the "Object Details" card
			await waitForText("Object Details");
		});

		test("shows object metadata on detail page", async () => {
			await navigateToR2Object("my-bucket", "config.json");

			// Object Details card should show metadata labels and values
			await waitForText("Object Details");
			await waitForText("Date Created");
			await waitForText("Type");
			await waitForText("Size");
		});

		test("shows custom metadata when present", async () => {
			// config.json has custom metadata: { author: "admin", created: "2025-01-15" }
			await navigateToR2Object("my-bucket", "config.json");

			await waitForText("Custom Metadata");
			await waitForText("author");
			await waitForText("admin");
			await waitForText("created");
			await waitForText("2025-01-15");
		});

		test("shows 'No custom metadata' when none is set", async () => {
			// readme.txt has no custom metadata
			await navigateToR2Object("my-bucket", "readme.txt");

			await waitForText("No custom metadata set");
		});

		test("shows Download and Delete buttons on detail page", async () => {
			await navigateToR2Object("my-bucket", "readme.txt");

			const downloadButton = page.getByRole("button", { name: "Download" });
			const deleteButton = page.getByRole("button", { name: "Delete" });

			await downloadButton.waitFor({ state: "visible" });
			await deleteButton.waitFor({ state: "visible" });
		});

		test("breadcrumbs show full path for nested objects", async () => {
			await navigateToR2Object("my-bucket", "documents/report.txt");

			// Breadcrumbs should show: R2 > my-bucket > documents > report.txt
			await waitForBreadcrumbText("R2");
			await waitForBreadcrumbText("my-bucket");
			await waitForBreadcrumbText("documents");
			await waitForBreadcrumbText("report.txt");
		});
	});

	describe("deleting objects", () => {
		test("shows delete confirmation dialog from table action menu", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Open the action menu on a file row
			const readmeRow = page.locator("tr").filter({ hasText: "readme.txt" });
			await readmeRow.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Delete" }).click();

			// Delete confirmation dialog should appear
			await waitForDialog();
			await waitForText("Delete object?");
		});

		test("cancels deletion when clicking Cancel", async ({ expect }) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			const readmeRow = page.locator("tr").filter({ hasText: "readme.txt" });
			await readmeRow.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Delete" }).click();

			await waitForDialog();

			// Click Cancel
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Cancel" })
				.click();

			// Dialog should close and object should still be visible
			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});

			const isVisible = await isTextVisible("readme.txt");
			expect(isVisible).toBe(true);
		});

		test("deletes object after confirmation from table", async ({ expect }) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Delete config.json (it has custom metadata, good to verify it's removed)
			const configRow = page.locator("tr").filter({ hasText: "config.json" });
			await configRow.getByRole("button", { name: "Actions" }).click();
			await page.getByRole("menuitem", { name: "Delete" }).click();

			await waitForDialog();

			// Confirm deletion
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Delete" })
				.click();

			// Wait for dialog to close
			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});

			// config.json should no longer be visible in the table
			const isVisible = await isTextVisible("config.json");
			expect(isVisible).toBe(false);
		});

		test("shows delete confirmation from object detail page", async () => {
			await navigateToR2Object("my-bucket", "readme.txt");
			await waitForText("Object Details");

			// Click the Delete button on the detail page
			await page.getByRole("button", { name: "Delete" }).click();

			await waitForDialog();
			await waitForText("Delete object?");

			// "readme.txt" appears in multiple places (sidebar, breadcrumbs, heading),
			// so scope the assertion to the dialog.
			const dialog = page.getByRole("dialog");
			await dialog.getByText("readme.txt").waitFor({ state: "visible" });
		});

		test("deletes object from detail page and navigates back", async () => {
			await navigateToR2Object("my-bucket", "logs/access.log");
			await waitForText("Object Details");

			await page.getByRole("button", { name: "Delete" }).click();
			await waitForDialog();

			// Confirm deletion
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Delete" })
				.click();

			// Should navigate back to the bucket view (parent prefix)
			await waitForText("R2");
			await waitForTableRows(1);
		});
	});

	describe("adding directories", () => {
		test("opens add directory dialog", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			await clickButton("Add directory");

			await waitForDialog();
			await waitForText("Add directory");
			await waitForText("Directory name");
		});

		test("creates a new directory", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			await clickButton("Add directory");
			await waitForDialog();

			// Fill in the directory name
			const input = page.getByPlaceholder("my-directory");
			await input.fill(`test-dir-e2e-${Date.now()}`);

			// Click Create
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Create" })
				.click();

			// Dialog should close
			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});
		});

		test("cancels add directory dialog", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			await clickButton("Add directory");
			await waitForDialog();

			const input = page.getByPlaceholder("my-directory");
			await input.fill("should-not-be-created");

			// Click Cancel
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Cancel" })
				.click();

			// Dialog should close
			await page.waitForSelector('[role="dialog"]', {
				state: "hidden",
				timeout: 5_000,
			});
		});

		test("disables Create button when directory name is empty", async ({
			expect,
		}) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			await clickButton("Add directory");
			await waitForDialog();

			// Create button should be disabled when input is empty
			const createButton = page
				.getByRole("dialog")
				.getByRole("button", { name: "Create" });
			expect(await createButton.isDisabled()).toBe(true);
		});
	});

	describe("upload dialog", () => {
		test("opens upload dialog", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			await clickButton("Upload");

			await waitForDialog();
			await waitForText("Upload object");
			await waitForText("Drop a file here or click to browse");
		});

		test("cancels upload dialog", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			await clickButton("Upload");
			await waitForDialog();

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

	describe("selection and bulk actions", () => {
		test("selects an object via checkbox", async ({ expect }) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Click the checkbox on the readme.txt row
			const readmeRow = page.locator("tr").filter({ hasText: "readme.txt" });
			const checkbox = readmeRow.getByRole("checkbox");
			await checkbox.click();

			expect(await checkbox.isChecked()).toBe(true);
		});

		test("selects all objects via header checkbox", async ({ expect }) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Click the "Select all" checkbox in the header
			const selectAllCheckbox = page.getByRole("checkbox", {
				name: "Select all",
			});
			await selectAllCheckbox.click();

			expect(await selectAllCheckbox.isChecked()).toBe(true);
		});

		test("shows bulk action menu when items are selected", async ({
			expect,
		}) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Select an item
			const readmeRow = page.locator("tr").filter({ hasText: "readme.txt" });
			await readmeRow.getByRole("checkbox").click();

			// The bulk actions button should be enabled
			const bulkActionsButton = page
				.locator("thead")
				.getByRole("button", { name: "Bulk actions" });
			expect(await bulkActionsButton.isDisabled()).toBe(false);
		});

		test("shift-click selects a contiguous range of rows", async ({
			expect,
		}) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(4);

			const checkboxes = page.locator("tbody tr").getByRole("checkbox");
			const count = await checkboxes.count();

			expect(count).toBeGreaterThanOrEqual(4);

			await checkboxes.nth(0).click();
			expect(await checkboxes.nth(0).isChecked()).toBe(true);

			// Shift-click the fourth row checkbox
			await checkboxes.nth(3).click({ modifiers: ["Shift"] });

			expect(await checkboxes.nth(0).isChecked()).toBe(true);
			expect(await checkboxes.nth(1).isChecked()).toBe(true);
			expect(await checkboxes.nth(2).isChecked()).toBe(true);
			expect(await checkboxes.nth(3).isChecked()).toBe(true);
		});

		test("shift-click deselects a contiguous range of rows", async ({
			expect,
		}) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(4);

			const checkboxes = page.locator("tbody tr").getByRole("checkbox");
			const count = await checkboxes.count();
			expect(count).toBeGreaterThanOrEqual(4);

			// Click the first row (sets anchor), then shift-click the fourth to select range
			await checkboxes.nth(0).click();
			await checkboxes.nth(3).click({ modifiers: ["Shift"] });

			expect(await checkboxes.nth(0).isChecked()).toBe(true);
			expect(await checkboxes.nth(1).isChecked()).toBe(true);
			expect(await checkboxes.nth(2).isChecked()).toBe(true);
			expect(await checkboxes.nth(3).isChecked()).toBe(true);

			// Shift-click the fourth row again to deselect the range
			await checkboxes.nth(3).click({ modifiers: ["Shift"] });

			expect(await checkboxes.nth(0).isChecked()).toBe(false);
			expect(await checkboxes.nth(1).isChecked()).toBe(false);
			expect(await checkboxes.nth(2).isChecked()).toBe(false);
			expect(await checkboxes.nth(3).isChecked()).toBe(false);
		});
	});

	describe("refresh", () => {
		test("refresh button is visible", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			const refreshButton = page.getByRole("button", { name: "Refresh" });
			await refreshButton.waitFor({ state: "visible", timeout: 10_000 });
		});

		test("refreshes the object list", async () => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Click refresh and verify the table still shows data
			await page.getByRole("button", { name: "Refresh" }).click();

			// After refresh, objects should still be visible
			await waitForTableRows(1);
			await waitForText("readme.txt");
		});
	});

	describe("downloading objects", () => {
		test("downloads file from object detail page", async ({ expect }) => {
			await navigateToR2Object("my-bucket", "readme.txt");
			await waitForText("Object Details");

			const { content, downloadPath, suggestedFilename } =
				await captureDownload(
					async () =>
						await page.getByRole("button", { name: "Download" }).click(),
					"readme.txt"
				);

			expect(suggestedFilename).toBe("readme.txt");
			expect(content).toBe(
				"Welcome to the R2 bucket! This is a sample readme file."
			);

			await cleanupDownload(downloadPath);
		});

		test("downloads nested file with correct filename", async ({ expect }) => {
			await navigateToR2Object("my-bucket", "documents/report.txt");
			await waitForText("Object Details");

			const { content, downloadPath, suggestedFilename } =
				await captureDownload(
					async () =>
						await page.getByRole("button", { name: "Download" }).click(),
					"report.txt"
				);

			// Should extract filename from path (report.txt, not documents/report.txt)
			expect(suggestedFilename).toBe("report.txt");
			expect(content).toContain("Annual Report 2024");

			await cleanupDownload(downloadPath);
		});

		test("downloads JSON file with correct content", async ({ expect }) => {
			await navigateToR2Object("my-bucket", "config.json");
			await waitForText("Object Details");

			const { content, downloadPath, suggestedFilename } =
				await captureDownload(
					async () =>
						await page.getByRole("button", { name: "Download" }).click(),
					"config.json"
				);

			expect(suggestedFilename).toBe("config.json");

			// Verify JSON parses correctly and has expected structure
			const parsed = JSON.parse(content);
			expect(parsed.version).toBe("1.0.0");
			expect(parsed.environment).toBe("development");

			await cleanupDownload(downloadPath);
		});

		test("downloads binary file (SVG) with correct content", async ({
			expect,
		}) => {
			await navigateToR2Object("my-bucket", "images/logo.svg");
			await waitForText("Object Details");

			const { content, downloadPath, suggestedFilename } =
				await captureDownload(
					async () =>
						await page.getByRole("button", { name: "Download" }).click(),
					"logo.svg"
				);

			expect(suggestedFilename).toBe("logo.svg");
			expect(content).toContain("<svg");
			expect(content).toContain("</svg>");
			expect(content).toContain('xmlns="http://www.w3.org/2000/svg"');

			await cleanupDownload(downloadPath);
		});

		test("downloads file from table row action menu", async ({ expect }) => {
			await navigateToR2Bucket("my-bucket");
			await waitForTableRows(1);

			// Open the action menu on a file row
			const readmeRow = page.locator("tr").filter({ hasText: "readme.txt" });
			await readmeRow.getByRole("button", { name: "Actions" }).click();

			// Click download in the menu
			const { content, downloadPath, suggestedFilename } =
				await captureDownload(
					async () =>
						await page.getByRole("menuitem", { name: "Download" }).click(),
					"readme.txt"
				);

			expect(suggestedFilename).toBe("readme.txt");
			expect(content).toBe(
				"Welcome to the R2 bucket! This is a sample readme file."
			);

			await cleanupDownload(downloadPath);
		});
	});
});
