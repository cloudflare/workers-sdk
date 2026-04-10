import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { page, viteUrl, workerUrl } from "./setup";

export { page, viteUrl };

/**
 * Navigate to a specific path in the app.
 */
async function navigateTo(path: string): Promise<void> {
	const url = new URL(path, viteUrl);
	await page.goto(url.toString());
}

/**
 * Wait for the page to finish loading (no pending network requests).
 */
async function waitForPageLoad(): Promise<void> {
	await page.waitForLoadState("networkidle");
}

/**
 * Seed the KV namespace with test data.
 */
export async function seedKV(): Promise<void> {
	await fetch(`${workerUrl}/kv/seed`);
}

/**
 * Seed the R2 bucket with test data.
 */
export async function seedR2(): Promise<void> {
	await fetch(`${workerUrl}/r2/seed`);
}

/**
 * Seed the D1 database with test data.
 */
export async function seedD1(): Promise<void> {
	await fetch(`${workerUrl}/d1`);
}

/**
 * Seed a Durable Object with test data.
 */
export async function seedDO(objectId: string = "test-object"): Promise<void> {
	await fetch(`${workerUrl}/do?id=${objectId}`);
}

/**
 * Common wait options for `vi.waitFor`
 */
const WAIT_OPTIONS = {
	interval: 100,
	timeout: 10_000,
};

/**
 * Navigate to a KV namespace.
 */
export async function navigateToKV(namespaceId: string): Promise<void> {
	await navigateTo(`/cdn-cgi/explorer/kv/${namespaceId}`);
	await waitForPageLoad();
}

/**
 * Navigate to an R2 bucket.
 */
export async function navigateToR2Bucket(bucketName: string): Promise<void> {
	await navigateTo(`/cdn-cgi/explorer/r2/${bucketName}`);
	await waitForPageLoad();
}

/**
 * Navigate to an R2 object detail page.
 */
export async function navigateToR2Object(
	bucketName: string,
	objectKey: string
): Promise<void> {
	await navigateTo(
		`/cdn-cgi/explorer/r2/${bucketName}/object/${encodeURIComponent(objectKey)}`
	);
	await waitForPageLoad();
}

/**
 * Navigate to a D1 database.
 */
export async function navigateToD1(
	databaseId: string,
	table?: string
): Promise<void> {
	let path = `/cdn-cgi/explorer/d1/${databaseId}`;
	if (table) {
		path += `?table=${encodeURIComponent(table)}`;
	}

	await navigateTo(path);
	await waitForPageLoad();
}

/**
 * Navigate to a Durable Object class.
 */
export async function navigateToDOClass(className: string): Promise<void> {
	await navigateTo(`/cdn-cgi/explorer/do/${className}`);
	await waitForPageLoad();
}

/**
 * Navigate to a specific Durable Object instance by hex ID.
 *
 * Note: The API requires the actual hex object ID, not a string name.
 * If you only have a string name (e.g., "test-object"), use `navigateToDOObjectByName` instead.
 */
export async function navigateToDOObject(
	className: string,
	objectId: string,
	table?: string
): Promise<void> {
	let path = `/cdn-cgi/explorer/do/${className}/${objectId}`;
	if (table) {
		path += `?table=${encodeURIComponent(table)}`;
	}

	await navigateTo(path);
	await waitForPageLoad();
}

/**
 * Navigate to a Durable Object instance by going through the class page UI.
 * This is necessary because the API requires hex object IDs, but tests often
 * only know the string name used with `idFromName()`.
 *
 * This function:
 * 1. Navigates to the DO class page
 * 2. Finds the first "Open Studio" link
 * 3. Extracts the hex object ID from the link href
 * 4. Navigates to the object page (optionally with a table selected)
 *
 * @returns The hex object ID that was extracted from the UI
 */
export async function navigateToDOObjectByName(
	className: string,
	table?: string,
	objectName: string = "test-object"
): Promise<string> {
	await navigateToDOClass(className);
	await waitForText(className);

	await fillByPlaceholder("Enter instance name or hex ID...", objectName);
	await page.getByRole("button", { name: "Open Studio" }).click();
	await waitForPageLoad();

	// Extract the object ID from the current URL after navigation.
	const objectPath = new URL(page.url()).pathname;
	const match = objectPath.match(/\/cdn-cgi\/explorer\/do\/[^/]+\/([^/?#]+)/);
	if (!match || !match[1]) {
		throw new Error(`Could not extract object ID from URL path: ${objectPath}`);
	}

	const objectId: string = match[1];

	if (table) {
		await navigateToDOObject(className, objectId, table);
	}

	return objectId;
}

/**
 * Wait for text to appear on the page.
 */
export async function waitForText(
	text: string,
	options?: {
		timeout?: number;
	}
): Promise<void> {
	await page.waitForSelector(`text=${text}`, {
		timeout: options?.timeout ?? WAIT_OPTIONS.timeout,
	});
}

/**
 * Wait for text to appear inside the breadcrumb navigation bar.
 *
 * Use this instead of `waitForText` when the same text also appears in the
 * sidebar (e.g. bucket names, object keys) to avoid Playwright resolving
 * to the wrong element.
 */
export async function waitForBreadcrumbText(
	text: string,
	options?: {
		timeout?: number;
	}
): Promise<void> {
	// The Kumo breadcrumb `<nav>` contains both a mobile and desktop layout.
	// The desktop layout uses `hidden sm:contents`, so target it directly to
	// avoid matching the hidden mobile `<span class="truncate">` first.
	const desktopBreadcrumb = page.locator(
		'nav[aria-label="breadcrumb"] > .hidden.sm\\:contents'
	);
	await desktopBreadcrumb
		.getByText(text)
		.first()
		.waitFor({
			state: "visible",
			timeout: options?.timeout ?? WAIT_OPTIONS.timeout,
		});
}

/**
 * Wait for an element to be visible.
 */
export async function waitForSelector(
	selector: string,
	options?: {
		timeout?: number;
	}
): Promise<void> {
	await page.waitForSelector(selector, {
		state: "visible",
		timeout: options?.timeout ?? WAIT_OPTIONS.timeout,
	});
}

/**
 * Fill an input field by placeholder text.
 */
export async function fillByPlaceholder(
	placeholder: string,
	value: string
): Promise<void> {
	const input = page.getByPlaceholder(placeholder);
	await input.fill(value);
}

/**
 * Click a button by its text content.
 */
export async function clickButton(text: string): Promise<void> {
	await page.getByRole("button", { name: text }).click();
}

/**
 * Check if an element with the given text is visible.
 */
export async function isTextVisible(text: string): Promise<boolean> {
	const element = page.getByText(text);
	return await element.isVisible();
}

/**
 * Wait for a table to have a certain number of rows.
 */
export async function waitForTableRows(
	minRows: number,
	options?: {
		timeout?: number;
	}
): Promise<void> {
	await page.waitForFunction(
		(min: number) => {
			const rows = document.querySelectorAll("tbody tr");
			return rows.length >= min;
		},
		minRows,
		{
			timeout: options?.timeout ?? WAIT_OPTIONS.timeout,
		}
	);
}

/**
 * Get the count of table rows.
 */
export async function getTableRowCount(): Promise<number> {
	const rows = await page.$$("tbody tr");
	return rows.length;
}

/**
 * Wait for a dialog/modal to appear.
 */
export async function waitForDialog(): Promise<void> {
	await page.waitForSelector('[role="dialog"]', {
		state: "visible",
		timeout: WAIT_OPTIONS.timeout,
	});
}

/**
 * Wait for the `CodeMirror` SQL editor to be ready and interactive.
 */
export async function waitForQueryEditor(options?: {
	timeout?: number;
}): Promise<void> {
	// Wait for the `CodeMirror` editor to be visible and have the `contenteditable` attribute
	await page.waitForSelector(".cm-editor .cm-content[contenteditable]", {
		state: "visible",
		timeout: options?.timeout ?? 10_000,
	});
}

/**
 * Type SQL into the `CodeMirror` query editor.
 * Clears any existing content first by selecting all.
 */
export async function typeInQueryEditor(sql: string): Promise<void> {
	const editor = page.locator(".cm-editor .cm-content[contenteditable]");
	await editor.click();

	// Small delay to ensure the editor has focus
	await page.waitForTimeout(100);

	// Select all existing content & replace it
	const isMac = process.platform === "darwin";
	const selectAllKey = isMac ? "Meta+a" : "Control+a";
	await page.keyboard.press(selectAllKey);

	await page.keyboard.type(sql);
}

/**
 * Click the "Run" button to execute the current SQL statement.
 */
export async function runQuery(): Promise<void> {
	await page.getByRole("button", { name: "Run" }).click();
}

/**
 * Run all SQL statements in the editor using the dropdown menu.
 */
export async function runAllQueries(): Promise<void> {
	const runDropdown = page.locator(
		'button:has(svg[class*="CaretDownIcon"]), button:has-text("Run") + button'
	);
	await runDropdown.click();

	await page.getByText("Run all statements").click();
}

/**
 * Open the table selector dropdown in the breadcrumb bar.
 */
export async function openTableSelector(): Promise<void> {
	// The `TableSelect` trigger text is dynamic ("Select table" or current table name).
	// Target the table selector trigger by its unique utility class on the breadcrumb row.
	const tableSelector = page
		.locator('button[class*="-mx-1.5"]:visible')
		.first();
	await tableSelector.click();

	await page.waitForSelector('[role="listbox"]', {
		state: "visible",
		timeout: 5_000,
	});
}

/**
 * Wait for the query to finish executing.
 * Looks for "Executed X/Y" text in the Summary pane.
 */
export async function waitForQueryResult(options?: {
	timeout?: number;
}): Promise<void> {
	await page.waitForSelector("text=/Executed \\d+\\/\\d+/", {
		timeout: options?.timeout ?? 10_000,
	});
}

/**
 * Click the "Refresh tables" button and wait for refresh to complete.
 */
export async function refreshTables(): Promise<void> {
	const refreshButton = page.getByRole("button", { name: "Refresh tables" });
	await refreshButton.click();
	await page.waitForTimeout(500);
}

interface DownloadResult {
	content: string;
	downloadPath: string;
	suggestedFilename: string;
}

/**
 * Click a download button and capture the downloaded file.
 * Returns the path, content, and suggested filename for verification.
 *
 * @param triggerDownload - Async function that triggers the download (e.g., clicks the download button)
 * @param filename - The expected filename for the downloaded file
 *
 * @returns DownloadResult with path, content, and suggested filename
 *
 * @example
 * const { content, suggestedFilename } = await captureDownload(
 *   async () => await page.getByRole("button", { name: "Download" }).click(),
 *   "readme.txt"
 * );
 * expect(suggestedFilename).toBe("readme.txt");
 * expect(content).toBe("Expected file content");
 * await cleanupDownload(downloadPath);
 */
export async function captureDownload(
	triggerDownload: () => Promise<void>,
	filename: string
): Promise<DownloadResult> {
	const downloadPromise = page.waitForEvent("download");

	await triggerDownload();

	const download = await downloadPromise;

	const downloadPath = join(tmpdir(), `e2e-download-${Date.now()}-${filename}`);
	await download.saveAs(downloadPath);

	const content = await readFile(downloadPath, "utf-8");

	return {
		content,
		downloadPath,
		suggestedFilename: download.suggestedFilename(),
	};
}

/**
 * Clean up a downloaded file after verification.
 */
export async function cleanupDownload(downloadPath: string): Promise<void> {
	try {
		await unlink(downloadPath);
	} catch {
		// Ignore errors if file doesn't exist
	}
}
