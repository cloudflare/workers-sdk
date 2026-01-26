import { describe, expect, test } from "vitest";
import { runLongLived, seed } from "./helpers";

// Note: the tests here just make sure that the validation does take place, for more fine grained
//       testing regarding the validation there are unit tests in src/__tests__/get-validated-wrangler-config-path.spec.ts

describe("during development wrangler config files are validated", () => {
	const noWranglerConfigAuxProjectPath = seed(
		"no-wrangler-config-for-auxiliary-worker",
		{ pm: "pnpm" }
	);
	test("for auxiliary workers", async () => {
		const proc = await runLongLived(
			"pnpm",
			"dev",
			noWranglerConfigAuxProjectPath
		);
		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr).toMatch(
			/The provided configPath .*? requested for one of your auxiliary workers doesn't point to an existing file/
		);
	});
});
