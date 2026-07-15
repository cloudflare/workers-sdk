import { describe, it } from "vitest";
import { getRuntimeHeader, RUNTIME_HEADER_COMMENT_PREFIX } from "../header";

describe("getRuntimeHeader", () => {
	it("includes the workerd version and compatibility date", ({ expect }) => {
		expect(getRuntimeHeader("1.0.0-test", "2024-11-06")).toBe(
			`${RUNTIME_HEADER_COMMENT_PREFIX}1.0.0-test 2024-11-06 `
		);
	});

	it("sorts compatibility flags alphabetically", ({ expect }) => {
		expect(getRuntimeHeader("1.0.0-test", "2024-11-06", ["b", "a", "c"])).toBe(
			`${RUNTIME_HEADER_COMMENT_PREFIX}1.0.0-test 2024-11-06 a,b,c`
		);
	});

	it("defaults to no flags when none are provided", ({ expect }) => {
		expect(getRuntimeHeader("1.0.0-test", "2024-11-06", [])).toBe(
			`${RUNTIME_HEADER_COMMENT_PREFIX}1.0.0-test 2024-11-06 `
		);
	});
});
