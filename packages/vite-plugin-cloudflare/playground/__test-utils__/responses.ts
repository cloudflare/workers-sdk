import { Agent, interceptors, request } from "undici";
import { page, viteTestUrl } from "./index";

/**
 * Headers that a browser sends when navigating to a document.
 *
 * `Sec-Fetch-Mode` is the one that matters: the asset worker only applies
 * `not_found_handling` when it is `navigate` (see
 * `packages/workers-shared/asset-worker/src/handler.ts`), and the router worker
 * branches on `Sec-Fetch-Dest`.
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

const dispatcher = new Agent({
	// The `basic-ssl` playground variants serve a self-signed certificate. The
	// Playwright browser context ignores those too (`ignoreHTTPSErrors` in
	// `vitest-setup.ts`).
	connect: { rejectUnauthorized: false },
	// Don't leave pooled sockets alive longer than a test file takes to finish,
	// so a stray keep-alive connection can't hold the worker open at teardown.
	keepAliveTimeout: 1_000,
}).compose(
	// Matches the browser's redirect limit, and what `fetch()` does by default.
	interceptors.redirect({ maxRedirections: 20 })
);

/**
 * Requests a path from the Vite server as if the browser were navigating to it.
 *
 * This deliberately uses undici's low-level `request()` rather than `fetch()`.
 * The Fetch spec requires implementations to set `Sec-Fetch-Mode` from the
 * request's `mode` (the "append the Fetch metadata headers" step), so `fetch()`
 * overwrites whatever the caller passed with `cors` before the request leaves
 * the process — see `appendFetchMetadata` in undici. `Sec-Fetch-Dest`, `-Site`
 * and `-User` are not implemented there, which is why only `Sec-Fetch-Mode` is
 * affected and the breakage is easy to miss. It is also the one the asset worker
 * branches on for `not_found_handling`.
 *
 * That makes this permanent rather than a bug to wait out: no Fetch-based API
 * can send `Sec-Fetch-Mode: navigate`, and `fetch(url, { mode: "navigate" })` is
 * rejected by the `Request` constructor. `request()` skips the Fetch layer
 * entirely and sends the headers as given.
 *
 * Going through Playwright would also send the right headers, but makes the
 * request outlive the test when the server is slow, which on Windows CI
 * surfaces as an unhandled "Target page, context or browser has been closed"
 * rejection that fails the whole run rather than just the test.
 */
async function navigate(path: string): Promise<string> {
	const { body } = await request(`${viteTestUrl}${path}`, {
		headers: NAVIGATION_HEADERS,
		dispatcher,
	});
	return body.text();
}

export async function getTextResponse(path = "/"): Promise<string> {
	return navigate(path);
}

export async function getJsonResponse(
	path = "/"
): Promise<null | Record<string, unknown> | Array<unknown>> {
	// Not `body.json()`, which reports parse failures without showing what came
	// back. Playground responses are usually HTML when this goes wrong.
	const text = await navigate(path);
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("Invalid JSON response:\n" + text);
	}
}

/**
 * Navigates the browser to `path` and returns the Playwright response.
 *
 * Only use this when the test asserts on something that requires the browser
 * (subsequent page state, or Playwright's `Response` API). Otherwise use
 * {@link getTextResponse} or {@link getJsonResponse}.
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
