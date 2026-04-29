import { describe, it, vi } from "vitest";
import { getAuthWorkerTimeoutMs } from "../user/auth-variables";

describe("auth-variables", () => {
	describe("getAuthWorkerTimeoutMs", () => {
		it("returns 5000 when WRANGLER_AUTH_WORKER_TIMEOUT is unset", ({
			expect,
		}) => {
			expect(getAuthWorkerTimeoutMs()).toBe(5000);
		});

		it("returns 0 when explicitly set to '0' (special no-timeout semantics)", ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "0");
			expect(getAuthWorkerTimeoutMs()).toBe(0);
		});

		it("returns the parsed value for a valid positive number", ({ expect }) => {
			vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "1500");
			expect(getAuthWorkerTimeoutMs()).toBe(1500);
		});

		// `Number("") === 0` would otherwise activate the special
		// "no timeout, no fallback" semantics rather than the documented
		// 5000ms default. An empty value (e.g. set via
		// `WRANGLER_AUTH_WORKER_TIMEOUT=` or a misconfigured `.env`) must
		// keep the default.
		it("returns 5000 for an empty value", ({ expect }) => {
			vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "");
			expect(getAuthWorkerTimeoutMs()).toBe(5000);
		});

		it("returns 5000 for a whitespace-only value", ({ expect }) => {
			vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "   ");
			expect(getAuthWorkerTimeoutMs()).toBe(5000);
		});

		it("returns 5000 for a non-numeric value", ({ expect }) => {
			vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "abc");
			expect(getAuthWorkerTimeoutMs()).toBe(5000);
		});

		it("returns 5000 for a negative number", ({ expect }) => {
			vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "-1");
			expect(getAuthWorkerTimeoutMs()).toBe(5000);
		});
	});
});
