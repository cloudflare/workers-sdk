import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("routes workerd structured logs to the correct output stream", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig(),
		"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("emits structured logs at various levels", () => {
				// __console is the original workerd console, saved before Vitest
				// patches globalThis.console. Output from __console goes through
				// workerd stdout -> structured log parsing -> handleStructuredLogs,
				// which routes error/warn to process.stderr and everything else
				// to process.stdout.
				__console.log("__STDOUT_LOG__");
				__console.warn("__STDERR_WARN__");
				__console.error("__STDERR_ERROR__");
				expect(true).toBe(true);
			});
		`,
	});
	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);

	// handleStructuredLogs routes log-level output to stdout
	expect(result.stdout).toContain("__STDOUT_LOG__");

	// handleStructuredLogs routes warn/error-level output to stderr
	expect(result.stderr).toContain("__STDERR_WARN__");
	expect(result.stderr).toContain("__STDERR_ERROR__");
});
