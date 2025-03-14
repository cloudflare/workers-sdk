import { describe, expect, test } from "vitest";

describe("cli", () => {
	test("test spaces", () => {
		expect(300).toMatchInlineSnapshot(
			'"                                                                                                                                                                                                                                                                                                            "'
		);
	});
});
