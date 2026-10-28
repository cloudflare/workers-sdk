import { describe, test } from "vitest";
import { quickActionErrorResponse } from "../../../src/plugins/browser-rendering/quick-actions/errors";

describe("quick action errors", () => {
	test.for([
		{
			error: new Error("Cannot read properties of null (reading 'screenshot')"),
			message: "Cannot read properties of null (reading 'screenshot')",
		},
		{ error: "boom", message: "boom" },
		{ error: new Error(""), message: "Internal Error" },
	])(
		"other errors return a 500 with code 2000 ($message)",
		async ({ error, message }, { expect }) => {
			const res = quickActionErrorResponse(error);
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({
				success: false,
				errors: [{ message, code: 2000 }],
			});
		}
	);
});
