import "vitest";
import { describe, it } from "vitest";
import { shouldCheckFetch } from "../deployment-bundle/bundle";

describe("shouldCheckFetch()", () => {
	it("should be true for old compat date", ({ expect }) => {
		expect(shouldCheckFetch("2024-09-01")).toBe(true);
	});

	it("should be false for new compat date", ({ expect }) => {
		expect(shouldCheckFetch("2024-09-02")).toBe(false);
	});

	it("should be true for old compat date + old compat flag", ({ expect }) => {
		expect(shouldCheckFetch("2024-09-01", ["ignore_custom_ports"])).toBe(true);
	});

	it("should be false for old compat date + new compat flag", ({ expect }) => {
		expect(shouldCheckFetch("2024-09-01", ["allow_custom_ports"])).toBe(false);
	});

	it("should be true for new compat date + old compat flag", ({ expect }) => {
		expect(shouldCheckFetch("2024-09-02", ["ignore_custom_ports"])).toBe(true);
	});

	it("should be false for new compat date + new compat flag", ({ expect }) => {
		expect(shouldCheckFetch("2024-09-02", ["allow_custom_ports"])).toBe(false);
	});
});
