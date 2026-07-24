import { describe, it } from "vitest";
import { toUrlPath } from "../index";

describe("toUrlPath", () => {
	it("should convert backslashes to forward slashes", ({ expect }) => {
		expect(toUrlPath("foo\\bar")).toBe("foo/bar");
		expect(toUrlPath("foo/bar")).toBe("foo/bar");
	});
});
