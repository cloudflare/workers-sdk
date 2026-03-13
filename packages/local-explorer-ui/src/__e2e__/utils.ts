import {
	navigateTo,
	page,
	seedD1,
	seedDO,
	seedKV,
	viteUrl,
	waitForPageLoad,
} from "./setup";

export { page, viteUrl, navigateTo, waitForPageLoad, seedKV, seedD1, seedDO };

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
 * Navigate to a D1 database.
 */
export async function navigateToD1(
	databaseId: string,
	table?: string
): Promise<void> {
	const path = table
		? `/cdn-cgi/explorer/d1/${databaseId}?table=${table}`
		: `/cdn-cgi/explorer/d1/${databaseId}`;
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
 * Navigate to a specific Durable Object instance.
 */
export async function navigateToDOObject(
	className: string,
	objectId: string,
	table?: string
): Promise<void> {
	const url = new URL(
		`/cdn-cgi/explorer/do/${className}/${objectId}`,
		"http://localhost"
	);
	if (table) {
		url.searchParams.set("table", table);
	}

	await navigateTo(url.href);
	await waitForPageLoad();
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
