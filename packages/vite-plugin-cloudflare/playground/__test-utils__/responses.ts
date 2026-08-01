import { page, viteTestUrl } from "./index";

/**
 * Headers that a browser sends when navigating to a document.
 *
 * `getTextResponse()` and `getJsonResponse()` used to drive requests through
 * Playwright's `page.goto()`, which is a real navigation. Some of the
 * playgrounds depend on that: the asset worker only applies
 * `not_found_handling` when `Sec-Fetch-Mode` is `navigate` (see
 * `packages/workers-shared/asset-worker/src/handler.ts`), and the router worker
 * branches on `Sec-Fetch-Dest`. Sending these headers keeps the plain `fetch()`
 * requests below equivalent to a navigation.
 *
 * Note that undici overwrites `Sec-Fetch-Mode` with `cors` on the way into
 * workerd, which the plugin works around by forwarding the original value in a
 * custom header (see `packages/vite-plugin-cloudflare/src/utils.ts`).
 */
const NAVIGATION_HEADERS = {
	Accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
	"Sec-Fetch-Site": "none",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-User": "?1",
	"Sec-Fetch-Dest": "document",
	"Upgrade-Insecure-Requests": "1",
};

/**
 * Fetches a path from the Vite server as if the browser were navigating to it.
 *
 * Going through Playwright instead makes the request outlive the test when the
 * server is slow, which on Windows CI surfaces as an unhandled
 * "Target page, context or browser has been closed" rejection that fails the
 * whole run rather than just the test.
 */
async function fetchNavigation(path: string): Promise<Response> {
	return fetch(`${viteTestUrl}${path}`, { headers: NAVIGATION_HEADERS });
}

export async function getTextResponse(path = "/"): Promise<string> {
	const response = await fetchNavigation(path);
	return response.text();
}

export async function getJsonResponse(
	path = "/"
): Promise<null | Record<string, unknown> | Array<unknown>> {
	const response = await fetchNavigation(path);
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("Invalid JSON response:\n" + text);
	}
}

/**
 * Navigates the browser to `path` and returns the Playwright response.
 *
 * Only use this when the test asserts on something that requires a real
 * browser navigation (response status, headers, or subsequent page state).
 * Otherwise use {@link getTextResponse} or {@link getJsonResponse}.
 */
export async function getResponse(path = "/") {
	const url = `${viteTestUrl}${path}`;
	// `page.waitForResponse()` defaults to a 30s timeout, which can outlive the
	// test itself. If the test times out while `page.goto()` below is still
	// pending, this promise never gets awaited, and teardown closing the page
	// rejects it with nothing attached. Vitest reports that as an unhandled
	// error, which fails the whole run rather than just the test. Bound the wait
	// and attach a handler up front so it can never escape; the `await` below
	// still surfaces the real error to the test.
	const response = page.waitForResponse(url, { timeout: 20_000 });
	response.catch(() => {});
	await page.goto(url);
	return response;
}
