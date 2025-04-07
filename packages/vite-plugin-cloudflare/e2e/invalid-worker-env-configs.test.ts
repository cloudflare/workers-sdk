import { describe } from "vitest";
import { test } from "./helpers.js";

// Note: the test here just makes sure that the validation does take place, for more fine grained
//       testing regarding the validation there are unit tests in src/__tests__/validate_worker_environments_resolved_configs.spec.ts

describe("during development wrangler config files are validated", () => {
	test("for the entry worker", async ({ expect, seed, viteDev }) => {
		const projectPath = await seed("invalid-worker-env-configs", "pnpm");

		const proc = viteDev(projectPath);

		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr).toContain(
			"The following environment configurations are incompatible with the Cloudflare Vite plugin"
		);
	});
});
