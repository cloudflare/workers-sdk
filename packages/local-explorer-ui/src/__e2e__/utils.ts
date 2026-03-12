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
	const url = new URL(`/cdn-cgi/explorer/do/${className}/${objectId}`);
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
