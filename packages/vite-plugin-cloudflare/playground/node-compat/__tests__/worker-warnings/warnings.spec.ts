import dedent from "ts-dedent";
import { expect, test, vi } from "vitest";
import { isBuild, serverLogs, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test.skipIf(isBuild)(
	"should display warnings if nodejs_compat is missing",
	async () => {
		await vi.waitFor(
			async () =>
				expect(serverLogs.warns.join("").replaceAll("\\", "/")).toContain(
					dedent`
				Unexpected Node.js imports for environment "worker". Do you need to enable the "nodejs_compat" compatibility flag? Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.
				 - "node:assert/strict" imported from "worker-warnings/index.ts"
				 - "perf_hooks" imported from "worker-warnings/index.ts"
				`
				),
			WAIT_FOR_OPTIONS
		);
	}
);
