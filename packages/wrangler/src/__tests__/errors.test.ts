import {
	APIError,
	CommandLineArgsError,
	DeprecationError,
	FatalError,
	MissingConfigError,
	ParseError,
	UserError,
} from "@cloudflare/workers-utils";
import { describe, it } from "vitest";

describe("errors", () => {
	describe("UserError", () => {
		it("takes a custom telemetry message", ({ expect }) => {
			const error = new UserError("message", { telemetryMessage: "telemetry" });
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("telemetry");
		});
		it("can set telemetryMessage to equal the main message", ({ expect }) => {
			const error = new UserError("message", { telemetryMessage: true });
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("message");
		});
	});

	describe("DeprecationError", () => {
		it("takes a custom telemetry message", ({ expect }) => {
			const error = new DeprecationError("message", {
				telemetryMessage: "telemetry",
			});
			expect(error.message).toBe("Deprecation:\nmessage");
			expect(error.telemetryMessage).toBe("telemetry");
		});
		it("can set telemetryMessage to equal the main message", ({ expect }) => {
			const error = new DeprecationError("message", { telemetryMessage: true });
			expect(error.message).toBe("Deprecation:\nmessage");
			expect(error.telemetryMessage).toBe("Deprecation:\nmessage");
		});
	});

	describe("FatalError", () => {
		it("takes a custom telemetry message", ({ expect }) => {
			const error = new FatalError("message", undefined, {
				telemetryMessage: "telemetry",
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("telemetry");
			expect(error.code).toBeUndefined();
		});
		it("can set telemetryMessage to equal the main message", ({ expect }) => {
			const error = new FatalError("message", 1, { telemetryMessage: true });
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("message");
			expect(error.code).toBe(1);
		});
	});

	describe("CommandLineArgsError", () => {
		it("takes a custom telemetry message", ({ expect }) => {
			const error = new CommandLineArgsError("message", {
				telemetryMessage: "telemetry",
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("telemetry");
		});
		it("can set telemetryMessage to equal the main message", ({ expect }) => {
			const error = new CommandLineArgsError("message", {
				telemetryMessage: true,
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("message");
		});
	});

	describe("JsonFriendlyFatalError", () => {
		it("takes a custom telemetry message", ({ expect }) => {
			const error = new FatalError("message", undefined, {
				telemetryMessage: "telemetry",
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("telemetry");
			expect(error.code).toBeUndefined();
		});
		it("can set telemetryMessage to equal the main message", ({ expect }) => {
			const error = new FatalError("message", 1, { telemetryMessage: true });
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("message");
			expect(error.code).toBe(1);
		});
	});

	describe("MissingConfigError", () => {
		it("just sets the telemetry message as the main message", ({ expect }) => {
			const error = new MissingConfigError("message");
			expect(error.message).toBe("Missing config value for message");
			expect(error.telemetryMessage).toBe("Missing config value for message");
		});
	});

	describe("ParseError", () => {
		it("takes a custom telemetry message", ({ expect }) => {
			const error = new ParseError({
				text: "message",
				telemetryMessage: "telemetry",
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("telemetry");
		});
		it("can set telemetryMessage to equal the main message", ({ expect }) => {
			const error = new ParseError({
				text: "message",
				telemetryMessage: true,
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("message");
		});
	});

	describe("APIError", () => {
		it("takes a custom telemetry message", ({ expect }) => {
			const error = new APIError({
				text: "message",
				telemetryMessage: "telemetry",
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("telemetry");
		});
		it("can set telemetryMessage to equal the main message", ({ expect }) => {
			const error = new APIError({
				text: "message",
				telemetryMessage: true,
			});
			expect(error.message).toBe("message");
			expect(error.telemetryMessage).toBe("message");
		});
	});
});
