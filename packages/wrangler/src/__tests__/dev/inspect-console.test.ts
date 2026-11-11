import { describe, it } from "vitest";
import { logConsoleMessage } from "../../dev/inspect";
import { mockConsoleMethods } from "../helpers/mock-console";
import type Protocol from "devtools-protocol";

describe("logConsoleMessage", () => {
	const std = mockConsoleMethods();

	it("prints the message of a failed console.assert() (#6227)", ({
		expect,
	}) => {
		// The runtime only sends `Runtime.consoleAPICalled` for assertions that
		// failed, and its args are the message args, without the condition.
		const evt = {
			type: "assert",
			args: [
				{
					type: "string",
					value: "This should display as 5 is NOT a string!",
				},
			],
			executionContextId: 1,
			timestamp: 0,
		} as Protocol.Runtime.ConsoleAPICalledEvent;

		logConsoleMessage(evt);

		const output = [std.out, std.err, std.warn].join("\n");
		expect(output).toContain("This should display as 5 is NOT a string!");
	});
});
