import { UserError } from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import { CLIError } from "../../cli-errors";
import type { CLIErrorOptions } from "../../cli-errors";

vi.mock("@cloudflare/deploy-helpers", () => ({
	drawBox: vi.fn((lines: string[]) => `<box>${lines.join("\n")}</box>`),
}));

/**
 * Concrete subclass for testing the abstract CLIError.
 */
class TestCLIError extends CLIError {
	constructor(
		humanMessage: string,
		aiMessage: string,
		options: CLIErrorOptions
	) {
		super(humanMessage, aiMessage, options);
	}
}

describe("CLIError", () => {
	describe("message selection", () => {
		it("uses human message when not in agentic environment", ({ expect }) => {
			const error = new TestCLIError("human msg", "ai msg", {
				telemetryMessage: false,
			});
			expect(error.message).toBe("human msg");
			expect(error.humanMessage).toBe("human msg");
			expect(error.aiMessage).toBe("ai msg");
		});

		it("uses AI message wrapped in a box when in agentic environment", async ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "true");

			const { drawBox } = vi.mocked(await import("@cloudflare/deploy-helpers"));

			const error = new TestCLIError("human msg", "ai msg", {
				telemetryMessage: false,
			});
			expect(drawBox).toHaveBeenCalledWith(["ai msg"]);
			expect(error.message).toContain(
				"An error occurred, see the following details on how to handle it:"
			);
			expect(error.message).toContain("<box>ai msg</box>");
			expect(error.humanMessage).toBe("human msg");
			expect(error.aiMessage).toBe("ai msg");
		});
	});

	describe("isUserError", () => {
		it("defaults to true", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
			});
			expect(error.isUserError).toBe(true);
		});

		it("can be set to false", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
				isUserError: false,
			});
			expect(error.isUserError).toBe(false);
		});

		it("can be explicitly set to true", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
				isUserError: true,
			});
			expect(error.isUserError).toBe(true);
		});
	});

	describe("exitCode", () => {
		it("defaults to undefined", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
			});
			expect(error.exitCode).toBeUndefined();
		});

		it("can be set to a number", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
				exitCode: 2,
			});
			expect(error.exitCode).toBe(2);
		});
	});

	describe("telemetryMessage", () => {
		it("preserves a string telemetry label", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: "my telemetry label",
			});
			expect(error.telemetryMessage).toBe("my telemetry label");
		});

		it("uses the selected message when telemetryMessage is true (human)", ({
			expect,
		}) => {
			const error = new TestCLIError("human msg", "ai msg", {
				telemetryMessage: true,
			});
			// In non-agentic environment, the human message is selected
			expect(error.telemetryMessage).toBe("human msg");
		});

		it("uses the selected message when telemetryMessage is true (AI)", ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "true");

			const error = new TestCLIError("human msg", "ai msg", {
				telemetryMessage: true,
			});
			// In agentic environment, the formatted AI message is selected
			expect(error.telemetryMessage).toContain("ai msg");
		});

		it("sets telemetryMessage to undefined when false", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
			});
			expect(error.telemetryMessage).toBeUndefined();
		});
	});

	describe("prototype chain", () => {
		it("is an instance of Error", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
			});
			expect(error).toBeInstanceOf(Error);
		});

		it("is an instance of CLIError", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
			});
			expect(error).toBeInstanceOf(CLIError);
		});

		it("is NOT an instance of UserError", ({ expect }) => {
			const error = new TestCLIError("h", "a", {
				telemetryMessage: false,
			});
			expect(error).not.toBeInstanceOf(UserError);
		});
	});
});
