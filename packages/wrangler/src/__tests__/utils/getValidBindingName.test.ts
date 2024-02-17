import { getValidBindingName } from "../../utils/getValidBindingName";

describe("getValidBindingName", () => {
	it("should replace dashes with underscores", () => {
		expect(getValidBindingName("MY-NAME")).toBe("MY_NAME");
	});

	it("should replace consecutive underscores with single underscore", () => {
		expect(getValidBindingName("MY-_ NAME")).toBe("MY_NAME");
	});

	it("should prepend an underscore if it starts with a number", () => {
		expect(getValidBindingName("123")).toBe("_123");
	});

	it("should replace whitespaces with underscores", () => {
		expect(getValidBindingName("MY NAME")).toBe("MY_NAME");
		expect(getValidBindingName("MY	NAME")).toBe("MY_NAME");
		expect(getValidBindingName("MY\nNAME")).toBe("MY_NAME");
	});

	it("should remove all invalid character", () => {
		expect(getValidBindingName("NAME$")).toBe("NAME");
	});

	it("should not remove alphabetic characters, numbers, or underscores", () => {
		expect(getValidBindingName("my_NAME")).toBe("my_NAME");
	});
});
