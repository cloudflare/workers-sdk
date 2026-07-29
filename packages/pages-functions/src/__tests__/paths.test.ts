import { toUrlPath } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";

describe("toUrlPath", () => {
	it("should convert backslashes to forward slashes", ({ expect }) => {
		expect(toUrlPath("foo\\bar")).toBe("foo/bar");
		expect(toUrlPath("foo/bar")).toBe("foo/bar");
	});
});
