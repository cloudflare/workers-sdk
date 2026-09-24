import { APIError, ParseError } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { isRoutesPermissionError } from "../src/triggers/publish-routes";

function apiError(status: number, code?: number): APIError {
	const error = new APIError({
		text: "A request to the Cloudflare API failed.",
		notes: [{ text: "No access to the specified resource." }],
		status,
	});
	if (code !== undefined) {
		error.code = code;
	}
	return error;
}

describe("isRoutesPermissionError", () => {
	it("treats code 10000 as a missing All Zones token at any status", ({
		expect,
	}) => {
		expect(isRoutesPermissionError(apiError(403, 10000))).toBe(true);
		expect(isRoutesPermissionError(apiError(200, 10000))).toBe(true);
	});

	it("treats a 403 with a missing code as the same permission rejection", ({
		expect,
	}) => {
		expect(isRoutesPermissionError(apiError(403))).toBe(true);
	});

	it("does not fall back for a 403 that carries a different code", ({
		expect,
	}) => {
		expect(isRoutesPermissionError(apiError(403, 9109))).toBe(false);
	});

	it("does not fall back for other statuses that omit code 10000", ({
		expect,
	}) => {
		expect(isRoutesPermissionError(apiError(400))).toBe(false);
		expect(isRoutesPermissionError(apiError(200))).toBe(false);
	});

	it("does not treat parse errors as route permission errors", ({ expect }) => {
		expect(
			isRoutesPermissionError(new ParseError({ text: "not an API error" }))
		).toBe(false);
	});
});
