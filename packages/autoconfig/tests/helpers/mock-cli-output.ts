import { stripVTControlCharacters } from "node:util";
import { stdout } from "@cloudflare/cli-shared-helpers/streams";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach } from "vitest";

/** Captures both the context logger and shared CLI rendering for output assertions. */
export function mockCliOutput() {
	const std = mockConsoleMethods();
	let output = "";
	const collect = (chunk: Buffer) => {
		output += chunk.toString();
	};
	beforeEach(() => {
		output = "";
		stdout.on("data", collect);
	});
	afterEach(() => {
		stdout.off("data", collect);
	});
	return {
		get out() {
			return std.out + stripVTControlCharacters(output);
		},
	};
}
