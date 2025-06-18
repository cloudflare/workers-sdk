import type { mockConsoleMethods } from "./mock-console";

/**
 * Assert that Wrangler has made a request matching a certain pattern. Unlike MSW (which mocks the return value of the request),
 * this helper asserts that a request has been made. It should be used in combination with MSW—MSW providing the mock API, and this helper being used
 * to make sure the right data is sent to the mock API.
 */
export function makeRequestAsserter(
	console: ReturnType<typeof mockConsoleMethods>
) {
	beforeEach(() => {
		vi.stubEnv("WRANGLER_LOG", "debug");
		vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");
	});
	return function assertRequest(
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
			headers: _headers,
			init: _init,
			bodyMatch,
		} = requestDetails?.groups ?? {};

		if (body) {
			expect(bodyMatch).toMatch(body);
		}
	};
}
