import http from "node:http";
import https from "node:https";
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

/** Statuses that `Response` refuses to construct with a body. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Matches the browser's redirect limit, and what `fetch()` does by default. */
const MAX_REDIRECTS = 20;

function requestOnce(url: URL): Promise<Response> {
	return new Promise((resolve, reject) => {
		const transport = url.protocol === "https:" ? https : http;
		const request = transport.request(
			url,
			{
				method: "GET",
				headers: NAVIGATION_HEADERS,
				// The `basic-ssl` playground variants serve a self-signed certificate.
				// The Playwright browser context ignores those too (`ignoreHTTPSErrors`
				// in `vitest-setup.ts`).
				rejectUnauthorized: false,
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("error", reject);
				response.on("end", () => {
					const status = response.statusCode ?? 200;
					const headers = new Headers();
					for (const [name, value] of Object.entries(response.headers)) {
						if (value === undefined) {
							continue;
						}
						for (const entry of Array.isArray(value) ? value : [value]) {
							headers.append(name, entry);
						}
					}
					const body = NULL_BODY_STATUSES.has(status)
						? null
						: Buffer.concat(chunks);
					resolve(
						new Response(body, {
							status,
							statusText: response.statusMessage,
							headers,
						})
					);
				});
			}
		);
		request.on("error", reject);
		request.end();
	});
}

/**
 * Requests a path from the Vite server as if the browser were navigating to it.
 *
 * This deliberately uses `node:http` rather than `fetch()`. Node's `fetch()`
 * (undici) rewrites `Sec-Fetch-Mode` to `cors` before the request leaves the
 * process — every other `Sec-Fetch-*` header survives, but that one does not,
 * and it is the one that decides whether the asset worker applies
 * `not_found_handling`. Requests made with `fetch()` are therefore genuinely
 * non-navigation requests, which `spa-with-api`'s tests rely on.
 *
 * Going through Playwright would send the right headers, but makes the request
 * outlive the test when the server is slow, which on Windows CI surfaces as an
 * unhandled "Target page, context or browser has been closed" rejection that
 * fails the whole run rather than just the test.
 */
async function navigate(path: string): Promise<Response> {
	let url = new URL(`${viteTestUrl}${path}`);

	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
		const response = await requestOnce(url);
		const location = response.headers.get("location");
		if (!REDIRECT_STATUSES.has(response.status) || location === null) {
			return response;
		}
		url = new URL(location, url);
	}

	throw new Error(`Too many redirects while requesting "${path}"`);
}

export async function getTextResponse(path = "/"): Promise<string> {
	const response = await navigate(path);
	return response.text();
}

export async function getJsonResponse(
	path = "/"
): Promise<null | Record<string, unknown> | Array<unknown>> {
	const response = await navigate(path);
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
