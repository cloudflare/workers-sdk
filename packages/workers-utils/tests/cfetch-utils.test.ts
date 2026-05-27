import { describe, it } from "vitest";
import { extractAccountTag, hasMorePages } from "../src/cfetch";

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
