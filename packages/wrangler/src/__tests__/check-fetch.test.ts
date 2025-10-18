import "vitest";
import { shouldCheckFetch } from "../deployment-bundle/bundle";

describe("shouldCheckFetch()", () => {
	it("should be true for old compat date", () => {
		expect(shouldCheckFetch("2024-09-01")).toBe(true);
	});

	it("should be false for new compat date", () => {
		expect(shouldCheckFetch("2024-09-02")).toBe(false);
	});

	it("should be true for old compat date + old compat flag", () => {
		expect(shouldCheckFetch("2024-09-01", ["ignore_custom_ports"])).toBe(true);
	});

	it("should be false for old compat date + new compat flag", () => {
		expect(shouldCheckFetch("2024-09-01", ["allow_custom_ports"])).toBe(false);
	});

	it("should be true for new compat date + old compat flag", () => {
		expect(shouldCheckFetch("2024-09-02", ["ignore_custom_ports"])).toBe(true);
	});

	it("should be false for new compat date + new compat flag", () => {
		expect(shouldCheckFetch("2024-09-02", ["allow_custom_ports"])).toBe(false);
	});

	it("should respect WRANGLER_CF_FETCH=true environment variable", () => {
		process.env.WRANGLER_CF_FETCH = "true";
		expect(shouldCheckFetch("2024-09-02", ["allow_custom_ports"])).toBe(true);
		delete process.env.WRANGLER_CF_FETCH;
	});

	it("should respect WRANGLER_CF_FETCH=false environment variable", () => {
		process.env.WRANGLER_CF_FETCH = "false";
		expect(shouldCheckFetch("2024-09-01", ["ignore_custom_ports"])).toBe(false);
		delete process.env.WRANGLER_CF_FETCH;
	});

	it("should be case insensitive for WRANGLER_CF_FETCH", () => {
		process.env.WRANGLER_CF_FETCH = "TRUE";
		expect(shouldCheckFetch("2024-09-02")).toBe(true);
		process.env.WRANGLER_CF_FETCH = "FALSE";
		expect(shouldCheckFetch("2024-09-01")).toBe(false);
		delete process.env.WRANGLER_CF_FETCH;
	});
});
