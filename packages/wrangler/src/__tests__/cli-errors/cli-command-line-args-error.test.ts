import { describe, it, vi } from "vitest";
import { CLICommandLineArgsError, CLIError } from "../../cli-errors";
import type { CLIErrorOptions } from "../../cli-errors";

vi.mock("@cloudflare/deploy-helpers", () => ({
	drawBox: vi.fn((lines: string[]) => `<box>${lines.join("\n")}</box>`),
}));

/**
 * Concrete subclass for testing the abstract CLICommandLineArgsError.
 */
class TestCLICommandLineArgsError extends CLICommandLineArgsError {
	constructor(
		humanMessage: string,
		aiMessage: string,
		options: CLIErrorOptions
	) {
		super(humanMessage, aiMessage, options);
	}
}

describe("CLICommandLineArgsError", () => {
	it("is an instance of CLIError", ({ expect }) => {
		const error = new TestCLICommandLineArgsError("human", "ai", {
			telemetryMessage: false,
		});
		expect(error).toBeInstanceOf(CLIError);
	});

	it("is an instance of CLICommandLineArgsError", ({ expect }) => {
		const error = new TestCLICommandLineArgsError("human", "ai", {
			telemetryMessage: false,
		});
		expect(error).toBeInstanceOf(CLICommandLineArgsError);
	});

	it("is an instance of Error", ({ expect }) => {
		const error = new TestCLICommandLineArgsError("human", "ai", {
			telemetryMessage: false,
		});
		expect(error).toBeInstanceOf(Error);
	});

	it("selects human message by default", ({ expect }) => {
		const error = new TestCLICommandLineArgsError("human", "ai", {
			telemetryMessage: false,
		});
		expect(error.message).toBe("human");
	});

	it("selects AI message in a box in agentic environment", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "true");

		const { drawBox } = vi.mocked(await import("@cloudflare/deploy-helpers"));

		const error = new TestCLICommandLineArgsError("human", "ai", {
			telemetryMessage: false,
		});
		expect(drawBox).toHaveBeenCalledWith(["ai"]);
		expect(error.message).toContain(
			"An error occurred, see the following details on how to handle it:"
		);
		expect(error.message).toContain("<box>ai</box>");
	});
});
