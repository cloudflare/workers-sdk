import { page, viteTestUrl } from "./index";

/**
 * Fetches JSON from the server using direct fetch (no browser).
 * Use this for tests that only need to hit API endpoints without browser interaction.
 * This avoids the race condition in `getJsonResponse` which uses Playwright's
 * `page.waitForResponse()` that can hang on Windows.
 */
export async function fetchJson(path = "/"): Promise<unknown> {
	const url = `${viteTestUrl}${path}`;
	const response = await fetch(url);
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("Invalid JSON response:\n" + text);
	}
}

export async function getTextResponse(
	path = "/",
	hostname?: string
): Promise<string> {
	const response = await getResponse(path, hostname);
	return response.text();
}

export async function getJsonResponse(
	path = "/",
	hostname?: string
): Promise<null | Record<string, unknown> | Array<unknown>> {
	const response = await getResponse(path, hostname);
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("Invalid JSON response:\n" + text);
	}
}

export async function getResponse(path = "/", hostname?: string) {
	let url: string;
	if (hostname) {
		const base = new URL(viteTestUrl);
		url = `${base.protocol}//${hostname}:${base.port}${path}`;
	} else {
		url = `${viteTestUrl}${path}`;
	}
	const response = page.waitForResponse(url);
	await page.goto(url);
	return response;
}
