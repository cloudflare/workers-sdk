import { describe, expect, test } from "vitest";
import { space } from "..";

describe("cli", () => {
	test("test spaces", () => {
		console.log(space(300));
		expect(space(300)).toMatchInlineSnapshot(
			'"                                                                                                                                                                                                                                                                                                            "'
		);
	});
});
