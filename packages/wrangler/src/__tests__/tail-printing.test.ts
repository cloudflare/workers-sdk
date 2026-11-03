import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { logger } from "../logger";
import {
	jsonPrintLogs,
	prettyPrintLogs,
	realishPrintLogs,
} from "../tail/printing";
import type { TailEventMessage } from "../tail/createTail";

beforeEach(() => {
	vi.spyOn(logger, "log").mockImplementation(() => {});
	vi.spyOn(logger, "error").mockImplementation(() => {});
	vi.spyOn(logger, "console").mockImplementation(() => {});
	vi.spyOn(logger, "json").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function createEvent(): TailEventMessage {
	return {
		outcome: "ok",
		eventTimestamp: 0,
		event: null,
		logs: [],
		exceptions: [],
	};
}

describe("tail output formatting", () => {
	it.for([
		{ name: "pretty", print: prettyPrintLogs },
		{ name: "remote preview", print: realishPrintLogs },
	])(
		"escapes string arguments and exceptions in $name output",
		({ print, name }, { expect }) => {
			const event = createEvent();
			event.logs = [
				{
					level: "log",
					timestamp: 0,
					message: ["before\u001b[0mafter\u009b", 42, { text: "value" }, null],
				},
			];
			event.exceptions = [
				{
					name: "Error\u0007",
					message: "example\rmessage",
					stack: "first line\n\tat example\u001b[0m",
					timestamp: 0,
				},
			];

			print(Buffer.from(JSON.stringify(event)));

			if (name === "pretty") {
				expect(logger.log).toHaveBeenCalledWith(
					"  (log)",
					"before\\u001b[0mafter\\u009b",
					42,
					{ text: "value" },
					null
				);
			} else {
				expect(logger.console).toHaveBeenCalledWith(
					"log",
					"before\\u001b[0mafter\\u009b",
					42,
					{ text: "value" },
					null
				);
			}
			expect(logger.error).toHaveBeenCalledWith(
				"Error\\u0007: example\\u000dmessage\nfirst line\n\tat example\\u001b[0m"
			);
		}
	);

	it("preserves Unicode, tabs and multiline log strings", ({ expect }) => {
		const event = createEvent();
		event.logs = [{ level: "info", timestamp: 0, message: ["café\n\t世界"] }];

		prettyPrintLogs(Buffer.from(JSON.stringify(event)));

		expect(logger.log).toHaveBeenCalledWith("  (info)", "café\n\t世界");
	});

	it("escapes event metadata without removing formatter styling", ({
		expect,
	}) => {
		const event = createEvent();
		event.event = {
			mailFrom: "sender\u001b@example.com",
			rcptTo: "recipient@example.com",
			rawSize: 42,
		};

		prettyPrintLogs(Buffer.from(JSON.stringify(event)));

		expect(logger.log).toHaveBeenCalledWith(
			expect.stringContaining("Email from:sender\\u001b@example.com")
		);
	});

	it("leaves structured JSON values intact", ({ expect }) => {
		const event = createEvent();
		event.logs = [{ level: "log", timestamp: 0, message: ["example\u001b"] }];

		jsonPrintLogs(Buffer.from(JSON.stringify(event)));

		expect(logger.json).toHaveBeenCalledWith(event);
	});
});
