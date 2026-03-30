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
	table?: string
): Promise<string> {
	await navigateToDOClass(className);
	await waitForText(className);

	const openStudioLink = page.locator('a:has-text("Open Studio")').first();
	await openStudioLink.waitFor({ state: "visible", timeout: 10_000 });

	const href = await openStudioLink.getAttribute("href");
	if (!href) {
		throw new Error("Could not find href on Open Studio link");
	}

	// Extract the object ID from the href (format: /cdn-cgi/explorer/do/{className}/{objectId})
	const match = href.match(/\/cdn-cgi\/explorer\/do\/[^/]+\/([a-f0-9]+)/);
	if (!match || !match[1]) {
		throw new Error(`Could not extract object ID from href: ${href}`);
	}
	const objectId: string = match[1];

	await navigateToDOObject(className, objectId, table);

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
 * Fill an input field by label text.
 */
export async function fillByLabel(label: string, value: string): Promise<void> {
	const input = page.getByLabel(label);
	await input.fill(value);
}

/**
 * Click a button by its text content.
 */
export async function clickButton(text: string): Promise<void> {
	await page.getByRole("button", { name: text }).click();
}

/**
 * Click a link by its text content.
 */
export async function clickLink(text: string): Promise<void> {
	await page.getByRole("link", { name: text }).click();
}

/**
 * Check if an element with the given text is visible.
 */
export async function isTextVisible(text: string): Promise<boolean> {
	const element = page.getByText(text);
	return await element.isVisible();
}

/**
 * Get all text content from elements matching a selector.
 */
export async function getAllTextContent(
	selector: string
): Promise<Array<string>> {
	const elements = await page.$$(selector);
	const texts = await Promise.all(
		elements.map((el: { textContent: () => Promise<string | null> }) =>
			el.textContent()
		)
	);

	return texts.filter((t: string | null): t is string => t !== null);
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
 * Assert that a table cell contains the expected text.
 * Throws an error if the text is not found.
 */
export async function assertTableCellContent(
	rowIndex: number,
	columnIndex: number,
	expectedText: string
): Promise<void> {
	const cell = page.locator(
		`tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`
	);
	const text = await cell.textContent();
	if (!text?.includes(expectedText)) {
		throw new Error(
			`Expected cell [${rowIndex}, ${columnIndex}] to contain "${expectedText}", but got "${text}"`
		);
	}
}

/**
 * Get the text content of a specific table cell.
 */
export async function getTableCellText(
	rowIndex: number,
	columnIndex: number
): Promise<string> {
	const cell = page.locator(
		`tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`
	);
	return (await cell.textContent()) ?? "";
}

/**
 * Click on a table row.
 */
export async function clickTableRow(rowIndex: number): Promise<void> {
	await page.click(`tbody tr:nth-child(${rowIndex + 1})`);
}

/**
 * Double-click on a table cell for editing.
 */
export async function doubleClickTableCell(
	rowIndex: number,
	columnIndex: number
): Promise<void> {
	await page.dblclick(
		`tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`
	);
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
 * Confirm a dialog by clicking the confirm/submit button.
 */
export async function confirmDialog(
	buttonText: string = "Confirm"
): Promise<void> {
	await page
		.getByRole("dialog")
		.getByRole("button", { name: buttonText })
		.click();
}

/**
 * Cancel a dialog.
 */
export async function cancelDialog(): Promise<void> {
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Cancel" })
		.click();
}

/**
 * Check if a dialog is visible.
 */
export async function isDialogVisible(): Promise<boolean> {
	const dialog = page.locator('[role="dialog"]');
	return await dialog.isVisible();
}

/**
 * Wait for loading to complete (no "Loading..." text visible).
 */
export async function waitForLoadingComplete(): Promise<void> {
	// Wait for any loading indicators to disappear
	await page.waitForFunction(
		() => {
			const loadingElements = document.querySelectorAll(
				':is([aria-busy="true"], .loading, [data-loading])'
			);
			return loadingElements.length === 0;
		},
		{
			timeout: WAIT_OPTIONS.timeout,
		}
	);
}

/**
 * Take a screenshot for debugging.
 */
export async function takeScreenshot(name: string): Promise<void> {
	await page.screenshot({
		fullPage: true,
		path: `screenshots/${name}.png`,
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

	// Type the new SQL using fill() which is faster and more reliable
	// Note: `CodeMirror`'s contenteditable doesn't support fill(), so we use keyboard.type
	// But we can speed it up by removing the artificial delay
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
	// The `TableSelect` uses a `Select.Trigger` which contains either "Select table" or the table name
	// Find the `Select` trigger by looking for the text + caret icon combo
	const tableSelector = page.locator('text="Select table"').first();
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
