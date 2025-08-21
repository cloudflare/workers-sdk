import type { mockConsoleMethods } from "./mock-console";

/**
 * Assert that Wrangler has made a request matching a certain pattern. Unlike MSW (which mocks the return value of the request),
 * this helper asserts that a request has been made. It should be used in combination with MSW—MSW providing the mock API, and this helper being used
 * to make sure the right data is sent to the mock API.
 *
 * This works by matching against the contents of Wrangler's debug logging,
 * which includes Cloudflare API requests that are made
 */
export function makeApiRequestAsserter(
	console: ReturnType<typeof mockConsoleMethods>
) {
	beforeEach(() => {
		vi.stubEnv("WRANGLER_LOG", "debug");
		vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");
	});
	return function assertApiRequest(
		url: RegExp,
		{ method, body }: { method?: string; body?: RegExp }
	) {
		const startLine = console.debug.match(
			new RegExp(`-- START CF API REQUEST: ${method} ` + url.source)
		);
		assert(startLine !== null, "Request not made by Wrangler");
		const requestDetails = console.debug
			.slice(startLine.index)
			.match(
				/HEADERS: (?<headers>(.|\n)*?)\nINIT: (?<init>(.|\n)*?)\n(BODY: (?<bodyMatch>(.|\n)*?)\n)?-- END CF API REQUEST/
			);
		const {
			headers: headersStr,
			init: _init,
			bodyMatch,
		} = requestDetails?.groups ?? {};

		if (body) {
			expect(bodyMatch).toMatch(body);
		}

		const headers = JSON.parse(headersStr);
		expect(headers).toEqual({ "user-agent": "wrangler/x.x.x" });
	};
}
