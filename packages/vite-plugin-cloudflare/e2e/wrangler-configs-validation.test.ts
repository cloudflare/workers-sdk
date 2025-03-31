import { describe } from "vitest";
import { runCommand, test } from "./helpers.js";

// Note: the tests here just make sure that the validation does take place, for more fine grained
//       testing regarding the validation there are unit tests in src/__tests__/get-validated-wrangler-config-path.spec.ts

describe("during development wrangler config files are validated", () => {
	test("for the entry worker", async ({ expect, seed, viteCommand }) => {
		const projectPath = await seed("no-wrangler-config");
		runCommand(`pnpm install`, projectPath);

		const proc = await viteCommand("pnpm", "dev", projectPath);

		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr).toMatch(
			/Error: No config file found in the .*? directory/
		);
	});

	test("for auxiliary workers", async ({ expect, seed, viteCommand }) => {
		const projectPath = await seed("no-wrangler-config-for-auxiliary-worker");
		runCommand(`pnpm install`, projectPath);

		const proc = await viteCommand("pnpm", "dev", projectPath);

		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr).toMatch(
			/The provided configPath .*? requested for one of your auxiliary workers doesn't point to an existing file/
		);
	});
});
