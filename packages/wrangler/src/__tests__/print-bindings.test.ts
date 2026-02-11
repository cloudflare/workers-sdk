import { stripVTControlCharacters } from "node:util";
import { describe, it } from "vitest";
import { printBindings } from "../utils/print-bindings";
import type { StartDevWorkerInput } from "../api/startDevWorker/types";

function callPrintBindings(bindings: StartDevWorkerInput["bindings"]) {
	const lines: string[] = [];
	printBindings(bindings, [], [], [], {
		log: (msg: string) => lines.push(msg),
	});
	return lines.map((l) => stripVTControlCharacters(l)).join("\n");
}

describe("printBindings — variable display", () => {
	it("shows config vars literally", ({ expect }) => {
		const output = callPrintBindings({
			CONFIG_VAR: { type: "plain_text", value: "visible value" },
		});

		expect(output).toContain('env.CONFIG_VAR ("visible value")');
	});

	it("shows --var/--vars as (hidden)", ({ expect }) => {
		const output = callPrintBindings({
			CLI_VAR: { type: "plain_text", value: "secret from cli", hidden: true },
		});

		expect(output).toContain('env.CLI_VAR ("(hidden)")');
		expect(output).not.toContain("secret from cli");
	});

	it("shows .dev.vars / secret file vars as (hidden)", ({ expect }) => {
		const output = callPrintBindings({
			SECRET_VAR: { type: "secret_text", value: "secret from dotenv" },
		});

		expect(output).toContain('env.SECRET_VAR ("(hidden)")');
		expect(output).not.toContain("secret from dotenv");
	});

	it("shows json vars literally", ({ expect }) => {
		const output = callPrintBindings({
			JSON_VAR: { type: "json", value: { key: "val" } },
		});

		expect(output).toContain("env.JSON_VAR");
		expect(output).toContain('{"key":"val"}');
	});

	it("handles all three sources together in one table", ({ expect }) => {
		const output = callPrintBindings({
			FROM_CONFIG: { type: "plain_text", value: "config value" },
			FROM_CLI: { type: "plain_text", value: "cli value", hidden: true },
			FROM_DOTENV: { type: "secret_text", value: "dotenv value" },
		});

		expect(output).toContain('env.FROM_CONFIG ("config value")');
		expect(output).toContain('env.FROM_CLI ("(hidden)")');
		expect(output).toContain('env.FROM_DOTENV ("(hidden)")');
		expect(output).not.toContain("cli value");
		expect(output).not.toContain("dotenv value");
	});

	it("truncates long config var values", ({ expect }) => {
		const longValue = "a".repeat(100);
		const output = callPrintBindings({
			LONG_VAR: { type: "plain_text", value: longValue },
		});

		expect(output).toContain("aaa...");
		expect(output).not.toContain(longValue);
	});
});
