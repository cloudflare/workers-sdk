import { FormData, Headers, Response } from "undici";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	extractAccountTag,
	hasMorePages,
	parseRetryAfterMs,
	parseRetryAfterValue,
	performApiFetchBase,
	throwFetchError,
} from "../src/cfetch";
import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "../src/environment-variables/misc-variables";
import { APIError } from "../src/parse";
import type { Logger } from "../src/logger";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("undici", async (importOriginal) => {
	const original = await importOriginal<typeof import("undici")>();
	return { ...original, fetch: fetchMock };
});

function createLogger(): Logger {
	return {
		loggerLevel: "debug",
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debugWithSanitization: vi.fn(),
	};
}

async function performFormDataFetch(logger: Logger): Promise<void> {
	const body = new FormData();
	body.append("field", "value");
	await performApiFetchBase(
		COMPLIANCE_REGION_CONFIG_UNKNOWN,
		"/test",
		{ method: "POST", body },
		"test-agent",
		logger,
		undefined,
		undefined,
		{ apiToken: "test-token" }
	);
}

describe("performApiFetchBase", () => {
	beforeEach(() => {
		fetchMock.mockResolvedValue(new Response());
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it.for(["true", "false"])(
		"redacts sensitive headers from request diagnostics with sanitization=%s",
		async (sanitize, { expect }) => {
			vi.stubEnv("WRANGLER_LOG_SANITIZE", sanitize);
			const logger = createLogger();
			await performApiFetchBase(
				COMPLIANCE_REGION_CONFIG_UNKNOWN,
				"/test",
				{
					headers: {
						authorization: "Bearer token",
						"x-AUTH-key": "global-key",
						"X-Auth-Email": "user@example.com",
						"X-Session": "session-secret",
						"Content-Type": "application/json",
					},
				},
				"test-agent",
				logger,
				undefined,
				undefined,
				{ apiToken: "test-token" }
			);
			const diagnostics =
				vi.mocked(logger.debugWithSanitization)?.mock.calls ?? [];
			for (const label of ["HEADERS:", "INIT:"]) {
				const values = diagnostics.find(([name]) => name === label)?.[1];
				expect(values).toContain('"x-auth-key": "[REDACTED]"');
				expect(values).toContain('"x-auth-email": "[REDACTED]"');
				expect(values).toContain('"x-session": "[REDACTED]"');
				expect(values).toContain('"authorization": "[REDACTED]"');
				expect(values).toContain('"content-type": "application/json"');
			}

			const headers = new Headers(fetchMock.mock.calls[0]?.[1].headers);
			expect(headers.get("x-auth-key")).toBe("global-key");
		}
	);

	it("preserves the sanitized FormData body hint without materializing the body", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_LOG_SANITIZE", "true");
		const logger = createLogger();
		const responseText = vi.spyOn(Response.prototype, "text");

		await performFormDataFetch(logger);

		expect(responseText).not.toHaveBeenCalled();
		expect(logger.debugWithSanitization).toHaveBeenCalledWith(
			"BODY:",
			"<multipart body>",
			null,
			2
		);
	});

	it("materializes FormData request bodies for unsanitized logs", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");
		const logger = createLogger();
		const responseText = vi.spyOn(Response.prototype, "text");

		await performFormDataFetch(logger);

		expect(responseText).toHaveBeenCalledOnce();
		expect(logger.debugWithSanitization).toHaveBeenCalledWith(
			"BODY:",
			expect.stringContaining('name="field"'),
			null,
			2
		);
	});

	it("does not materialize FormData request bodies when debug logs are disabled", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");
		const logger = createLogger();
		logger.loggerLevel = "log";
		const responseText = vi.spyOn(Response.prototype, "text");

		await performFormDataFetch(logger);

		expect(responseText).not.toHaveBeenCalled();
	});

	it("does not materialize FormData request bodies without a sanitized logger", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");
		const logger = createLogger();
		logger.debugWithSanitization = undefined;
		const responseText = vi.spyOn(Response.prototype, "text");

		await performFormDataFetch(logger);

		expect(responseText).not.toHaveBeenCalled();
	});
});

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
