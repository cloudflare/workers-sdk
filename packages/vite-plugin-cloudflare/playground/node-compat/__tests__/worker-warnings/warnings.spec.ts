import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import dedent from "ts-dedent";
import { expect, test, vi } from "vitest";
import { serverLogs } from "../../../__test-utils__";

test("should display warnings if nodejs_compat is missing", async () => {
	await vi.waitFor(async () => {
		expect(serverLogs.warns[0]?.replaceAll("\\", "/")).toContain(
			dedent`
				Unexpected Node.js imports for environment "worker". Do you need to enable the "nodejs_compat" compatibility flag? Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.
				 - "node:assert/strict" imported from "worker-warnings/index.ts"
				 - "perf_hooks" imported from "worker-warnings/index.ts"
				`
		);
	});
});
