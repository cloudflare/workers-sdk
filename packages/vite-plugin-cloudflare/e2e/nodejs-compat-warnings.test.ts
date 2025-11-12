import { dedent } from "ts-dedent";
import { describe, test } from "vitest";
import { runLongLived, seed } from "./helpers";

// This test validates that warnings are displayed when nodejs_compat is missing
// and Node.js imports are used without the compatibility flag.
describe("nodejs_compat warnings", () => {
	const projectPath = seed("nodejs-compat-warnings", "pnpm");

	test("displays warnings if Node.js built-ins are imported and the nodejs_compat flag is not enabled", async ({
		expect,
	}) => {
		const proc = await runLongLived("pnpm", "dev", projectPath);
		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr.replaceAll("\\", "/")).toContain(
			dedent`
				Unexpected Node.js imports for environment "worker". Do you need to enable the "nodejs_compat" compatibility flag? Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.
				 - "node:assert/strict" imported from "src/index.ts"
				 - "perf_hooks" imported from "src/index.ts"
				`
		);
	});
});
