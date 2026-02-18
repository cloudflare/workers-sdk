import { describe, test } from "vitest";
import { space } from "..";

describe("cli", () => {
	test("test spaces", ({ expect }) => {
		expect(space(300)).toMatchInlineSnapshot(
			'"                                                                                                                                                                                                                                                                                                            "'
		);
	});
});
