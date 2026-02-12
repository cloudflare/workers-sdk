import { ParseError } from "@cloudflare/workers-utils";
import { normalizeString } from "@cloudflare/workers-utils/test-helpers";
import { FormData } from "undici";
/* eslint-disable workers-sdk/no-vitest-import-expect -- helper functions with expect */
import { beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import * as checkCommands from "../check/commands";
import { logger } from "../logger";
import { helpIfErrorIsSizeOrScriptStartup } from "../utils/friendly-validator-errors";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

vi.mock("../check/commands", () => ({ analyseBundle: vi.fn() }));
const mockAnalyseBundle = vi.mocked(checkCommands.analyseBundle);

describe("helpIfErrorIsSizeOrScriptStartup", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	beforeEach(() => {
		mockAnalyseBundle.mockReset();

		// Ensure logger is set to debug level for testing
		const loggerLevel = logger.loggerLevel;
		logger.loggerLevel = "debug";
		return () => (logger.loggerLevel = loggerLevel); // Restore original logger level after test
	});

	it("cleanly reports a startup error even if bundle analysis fails", async () => {
		mockAnalyseBundle.mockRejectedValue(new Error("workerd profiling failed"));

		expect(
			await helpIfErrorIsSizeOrScriptStartup(
				makeStartupError("Script startup exceeded CPU limit."),
				{}, // no dependencies
				new FormData(), // mock worker bundle
				"/test"
			)
		).toMatchInlineSnapshot(`
				"Your Worker failed validation because it exceeded startup limits.

				Deploy failed
				 - Script startup exceeded CPU limit.

				To ensure fast responses, there are constraints on Worker startup, such as how much CPU it can use, or how long it can take. Your Worker has hit one of these startup limits. Try reducing the amount of work done during startup (outside the event handler), either by removing code or relocating it inside the event handler.

				Refer to https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time for more details"
			`);

		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "An error occurred while trying to locally profile the Worker: Error: workerd profiling failed",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "",
			}
		`);
	});

	it("reports size errors even if bundle analysis would fail", async () => {
		mockAnalyseBundle.mockRejectedValue(new Error("workerd profiling failed"));

		expect(
			await helpIfErrorIsSizeOrScriptStartup(
				makeScriptSizeError("Script size exceeded limits."),
				{ "test.js": { bytesInOutput: 1000 } }, // mock dependencies
				new FormData(), // mock worker bundle
				"/test"
			)
		).toMatchInlineSnapshot(`
			"Your Worker failed validation because it exceeded size limits.

			Script size exceeded limits.

			Here are the 1 largest dependencies included in your script:

			- test.js - 0.98 KiB

			If these are unnecessary, consider removing them
			"
		`);
		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "",
			}
		`);
	});

	it("includes profile information when bundle analysis succeeds", async () => {
		mockAnalyseBundle.mockResolvedValue({ nodes: [], samples: [] });

		const message = await helpIfErrorIsSizeOrScriptStartup(
			makeStartupError("Exceeded startup limits."),
			{}, // no dependencies
			new FormData(), // mock worker bundle
			process.cwd() // mock project root (the tmp dir)
		);

		expect(normalizeString(message ?? "")).toMatchInlineSnapshot(`
			"Your Worker failed validation because it exceeded startup limits.

			Deploy failed
			 - Exceeded startup limits.

			To ensure fast responses, there are constraints on Worker startup, such as how much CPU it can use, or how long it can take. Your Worker has hit one of these startup limits. Try reducing the amount of work done during startup (outside the event handler), either by removing code or relocating it inside the event handler.

			Refer to https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time for more details
			A CPU Profile of your Worker's startup phase has been written to .wrangler/tmp/startup-profile-<HASH>/worker.cpuprofile - load it into the Chrome DevTools profiler (or directly in VSCode) to view a flamegraph."
		`);
		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "",
			}
		`);
	});
});

function makeScriptSizeError(text: string): ParseError {
	const error = new ParseError({ text });
	Object.assign(error, { code: 10027 });
	return error;
}

function makeStartupError(message: string): ParseError {
	const error = new ParseError({
		text: "Deploy failed",
		notes: [{ text: message }],
	});
	Object.assign(error, { code: 10021 });
	return error;
}
