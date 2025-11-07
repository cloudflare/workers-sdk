import { describe, expect, test } from "vitest";

import { space } from "..";

describe("cli", () => {
	test("test spaces", () => {
		expect(space(300)).toMatchInlineSnapshot(
			'"                                                                                                                                                                                                                                                                                                            "'
		);
	});
});
