import { describe, expect, it } from "vitest";
import { getValidBindingName } from "../../utils/getValidBindingName";

describe("getValidBindingName", () => {
	it("should replace dashes with underscores", () => {
		expect(getValidBindingName("MY-NAME", "FALLBACK")).toBe("MY_NAME");
	});

	it("should replace consecutive underscores with single underscore", () => {
		expect(getValidBindingName("MY-_ NAME", "FALLBACK")).toBe("MY_NAME");
	});

	it("should prepend an underscore if it starts with a number", () => {
		expect(getValidBindingName("123", "FALLBACK")).toBe("_123");
	});

	it("should replace whitespaces with underscores", () => {
		expect(getValidBindingName("MY NAME", "FALLBACK")).toBe("MY_NAME");
		expect(getValidBindingName("MY	NAME", "FALLBACK")).toBe("MY_NAME");
		expect(getValidBindingName("MY\nNAME", "FALLBACK")).toBe("MY_NAME");
	});

	it("should remove all invalid character", () => {
		expect(getValidBindingName("NAME$", "FALLBACK")).toBe("NAME");
	});

	it("should not remove alphabetic characters, numbers, or underscores", () => {
		expect(getValidBindingName("my_NAME", "FALLBACK")).toBe("my_NAME");
	});

	it("should fallback if no valid binding name is possible", () => {
		expect(getValidBindingName("$$$", "FALLBACK")).toBe("FALLBACK");
	});

	it("should fallback if output is only underscores", () => {
		expect(getValidBindingName("___", "FALLBACK")).toBe("FALLBACK");
	});
});
