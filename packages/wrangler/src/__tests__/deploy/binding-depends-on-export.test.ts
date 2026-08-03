import { renderBindingDependsOnExportError } from "@cloudflare/deploy-helpers";
import { describe, it } from "vitest";

describe("renderBindingDependsOnExportError", () => {
	it("surfaces the EWC server message verbatim", ({ expect }) => {
		const serverMessage =
			"Durable Object binding 'ANOTHER' references class 'AnotherClass', which is declared in `exports` but not yet provisioned. Deploy this version to provision the class, or remove the binding and access the Durable Object via `ctx.exports.AnotherClass` until then.";

		expect(renderBindingDependsOnExportError(serverMessage)).toBe(
			serverMessage
		);
	});

	it("trims surrounding whitespace from the server message", ({ expect }) => {
		expect(renderBindingDependsOnExportError("  hello world  ")).toBe(
			"hello world"
		);
	});

	it("falls back to a generic actionable message when the server message is empty", ({
		expect,
	}) => {
		const out = renderBindingDependsOnExportError("");

		expect(out).toContain("declared in `exports` but not yet provisioned");
		expect(out).toContain("ctx.exports.<ClassName>");
	});
});
