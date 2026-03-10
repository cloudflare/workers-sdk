import { describe, test } from "vitest";
import { runLongLived, seed } from "./helpers";

describe("nodejs_compat warnings - Node.js built-ins imported directly", () => {
	const projectPath = seed("nodejs-compat-warnings/direct-import", {
		pm: "pnpm",
	});

	test("displays warnings if Node.js built-ins are imported and the `nodejs_compat` flag is not enabled", async ({
		expect,
	}) => {
		const proc = await runLongLived("pnpm", "dev", projectPath);
		expect(await proc.exitCode).not.toBe(0);
		const errorLogs = proc.stderr.replaceAll("\\", "/");
		expect(errorLogs).toContain(
			'Unexpected Node.js imports for environment "worker". Do you need to enable the "nodejs_compat" compatibility flag? Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.'
		);
		expect(errorLogs).toContain('- "node:assert/strict" imported from');
		expect(errorLogs).toContain('- "perf_hooks" imported from');
	});
});

describe("nodejs_compat warnings - Node.js built-ins imported via dependency", () => {
	const projectPath = seed("nodejs-compat-warnings/dependency-import", {
		pm: "pnpm",
	});

	test("displays warnings if Node.js built-ins are imported and the `nodejs_compat` flag is not enabled", async ({
		expect,
	}) => {
		const proc = await runLongLived("pnpm", "dev", projectPath);
		expect(await proc.exitCode).not.toBe(0);
		const errorLogs = proc.stderr.replaceAll("\\", "/");
		expect(errorLogs).toContain(
			'Unexpected Node.js imports for environment "worker". Do you need to enable the "nodejs_compat" compatibility flag? Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.'
		);
		expect(errorLogs).toContain('- "node:fs" imported from');
	});
});
