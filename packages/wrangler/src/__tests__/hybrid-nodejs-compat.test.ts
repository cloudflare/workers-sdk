import {
	decodeFromLowerCase,
	encodeToLowerCase,
} from "../deployment-bundle/esbuild-plugins/hybrid-nodejs-compat";

describe("hybrid nodejs compat", () => {
	describe("toLowerCase encoding and decoding", () => {
		describe("encodeToLowerCase", () => {
			it("should encode uppercase characters to lowercase prefixed with $", () => {
				expect(encodeToLowerCase("Performance")).toBe("$performance");
				expect(encodeToLowerCase("PerformanceMark")).toBe("$performance$mark");
			});

			it("should encode $ as $$", () => {
				expect(encodeToLowerCase("$initial-and-final$")).toBe(
					"$$initial-and-final$$"
				);
				expect(encodeToLowerCase("$FollowedByCapital")).toBe(
					"$$$followed$by$capital"
				);
				expect(encodeToLowerCase("In$the$middle")).toBe("$in$$the$$middle");
			});
		});

		describe("decodeFromLowerCase", () => {
			it("should decode uppercase characters from lowercase prefixed with $", () => {
				expect(decodeFromLowerCase("$foo$bar")).toBe("FooBar");
			});

			it("should decode $ from $$", () => {
				expect(decodeFromLowerCase("$$foo$bar")).toBe("$fooBar");
				expect(decodeFromLowerCase("$$$query$$")).toBe("$Query$");
				expect(decodeFromLowerCase("$$$$query")).toBe("$$query");
				expect(decodeFromLowerCase("$$$$$query")).toBe("$$Query");
			});
		});

		it("should be symmetrical", () => {
			expect(decodeFromLowerCase(encodeToLowerCase("Performance"))).toBe(
				"Performance"
			);
			expect(decodeFromLowerCase(encodeToLowerCase("$foo$BarBaz"))).toBe(
				"$foo$BarBaz"
			);
		});
	});
});
