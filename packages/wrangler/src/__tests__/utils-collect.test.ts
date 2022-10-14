import { collect } from "../utils/collect";

// a test suite that handles the collect function
describe("collect", () => {
	it("should return an empty object when passed undefined", () => {
		expect(collect(undefined)).toEqual({});
	});

	it("should return an empty object when passed an empty array", () => {
		expect(collect([])).toEqual({});
	});

	it("should return an object with a single key/value pair when passed an array with a single string", () => {
		expect(collect(["some-key:some-value"])).toEqual({
			"some-key": "some-value",
		});
	});

	it("should return an object with multiple key/value pairs when passed an array with multiple strings", () => {
		expect(
			collect(["some-key:some-value", "some-other-key:some-other-value"])
		).toEqual({
			"some-key": "some-value",
			"some-other-key": "some-other-value",
		});
	});

	it("should return an object with multiple key/value pairs when passed an array with multiple strings with multiple colons", () => {
		expect(
			collect([
				"some-key:https://some-value.com",
				"some-other-key:https://some-other-value.com",
			])
		).toEqual({
			"some-key": "https://some-value.com",
			"some-other-key": "https://some-other-value.com",
		});
	});
});
