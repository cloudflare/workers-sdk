import { describe, it } from "vitest";
import {
	extractAccountTag,
	hasMorePages,
	parseRetryAfterMs,
	parseRetryAfterValue,
	throwFetchError,
} from "../src/cfetch";
import { APIError } from "../src/parse";

/**
 * hasMorePages is a function that returns a boolean based on the result_info
 * object returned from the cloudflare v4 API - if the current page is less
 * than the total number of pages, it returns true, otherwise false.
 */
describe("hasMorePages", () => {
	it("should handle result_info not having enough results to paginate", ({
		expect,
	}) => {
		expect(
			hasMorePages({
				page: 1,
				per_page: 10,
				count: 5,
				total_count: 5,
			})
		).toBe(false);
	});
	it("should return true if the current page is less than the total number of pages", ({
		expect,
	}) => {
		expect(
			hasMorePages({
				page: 1,
				per_page: 10,
				count: 10,
				total_count: 100,
			})
		).toBe(true);
	});
	it("should return false if we are on the last page of results", ({
		expect,
	}) => {
		expect(
			hasMorePages({
				page: 10,
				per_page: 10,
				count: 10,
				total_count: 100,
			})
		).toBe(false);
	});
});

describe("extractAccountTag", () => {
	it("should return undefined when resource does not have it", ({ expect }) => {
		expect(extractAccountTag("/accounts")).toBeUndefined();
		expect(extractAccountTag("/accounts/")).toBeUndefined();
		expect(extractAccountTag("/accounts//more")).toBeUndefined();
	});
	it("should return tag when resource has it", ({ expect }) => {
		expect(extractAccountTag("/accounts/foo")).toBe("foo");
		expect(extractAccountTag("/accounts/bar/")).toBe("bar");
		expect(extractAccountTag("/accounts/baz/more")).toBe("baz");
	});
});

describe("parseRetryAfterMs", () => {
	it("should return undefined when the header is absent", ({ expect }) => {
		expect(parseRetryAfterMs(new Headers())).toBeUndefined();
	});

	it("should parse delta-seconds into milliseconds", ({ expect }) => {
		expect(parseRetryAfterMs(new Headers({ "Retry-After": "120" }))).toBe(
			120_000
		);
		expect(parseRetryAfterMs(new Headers({ "Retry-After": "0" }))).toBe(0);
	});

	it("should parse an HTTP-date into a millisecond delay", ({ expect }) => {
		const future = new Date(Date.now() + 60_000);
		const ms = parseRetryAfterMs(
			new Headers({ "Retry-After": future.toUTCString() })
		);
		expect(ms).toBeGreaterThan(55_000);
		expect(ms).toBeLessThanOrEqual(60_000);
	});

	it("should clamp HTTP-dates in the past to 0", ({ expect }) => {
		const past = new Date(Date.now() - 60_000);
		expect(
			parseRetryAfterMs(new Headers({ "Retry-After": past.toUTCString() }))
		).toBe(0);
	});

	it("should return undefined for an unparsable value", ({ expect }) => {
		expect(
			parseRetryAfterMs(new Headers({ "Retry-After": "not-a-value" }))
		).toBeUndefined();
	});
});

// parseRetryAfterValue is the shared parser behind parseRetryAfterMs, exposed
// separately for clients (e.g. the official `cloudflare` SDK) whose headers
// aren't a `Headers` object with a `.get()` method.
describe("parseRetryAfterValue", () => {
	it("should parse a raw delta-seconds string", ({ expect }) => {
		expect(parseRetryAfterValue("30")).toBe(30_000);
	});

	it("should return undefined for null/undefined", ({ expect }) => {
		expect(parseRetryAfterValue(null)).toBeUndefined();
		expect(parseRetryAfterValue(undefined)).toBeUndefined();
	});
});

describe("throwFetchError retryAfterMs", () => {
	it("hoists retryAfterMs onto the thrown APIError", ({ expect }) => {
		expect.assertions(2);
		try {
			throwFetchError(
				"/some/resource",
				{
					success: false,
					result: null,
					errors: [{ code: 10013, message: "rate limited" }],
				},
				429,
				30_000
			);
		} catch (err) {
			expect(err).toMatchObject({ retryAfterMs: 30_000 });
			const error = err as { notes: { text: string }[] };
			const retryNote = error.notes.find((n) => n.text.includes("Retry-After"));
			expect(retryNote?.text).toMatch(/30 second/);
		}
	});

	it("leaves retryAfterMs undefined when no header was present", ({
		expect,
	}) => {
		expect.assertions(1);
		try {
			throwFetchError(
				"/some/resource",
				{
					success: false,
					result: null,
					errors: [{ code: 1000, message: "some error" }],
				},
				400
			);
		} catch (err) {
			expect(err).toMatchObject({ retryAfterMs: undefined });
		}
	});
});

describe("APIError.isRetryable", () => {
	// isRetryable() stays 5xx-only: a caller retrying immediately on `true`
	// with no backoff must not see a 429 as retryable. 429 handling lives in
	// retryOnAPIFailure() instead, which knows about retryAfterMs/backoff.
	it("should not consider a 429 retryable", ({ expect }) => {
		const err = new APIError({
			status: 429,
			text: "rate limited",
			telemetryMessage: false,
		});
		expect(err.isRetryable()).toBe(false);
	});

	it("should consider 5xx retryable", ({ expect }) => {
		const err = new APIError({
			status: 503,
			text: "server error",
			telemetryMessage: false,
		});
		expect(err.isRetryable()).toBe(true);
	});
});
