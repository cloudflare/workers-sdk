import { describe, expect, test } from "vitest";
import { runLongLived, seed } from "./helpers";

// The test here just makes sure that the validation takes place.
// Unit tests for the validation are in `src/__tests__/validate-worker-environment-options.spec.ts`
describe("validate Worker environment options", () => {
	const projectPath = seed("invalid-worker-environment-options", {
		pm: "pnpm",
	});

	test("throws an error for invalid environment options", async () => {
		const proc = await runLongLived("pnpm", "dev", projectPath);
		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr).toContain(
			"The following environment options are incompatible with the Cloudflare Vite plugin"
		);
	});
});
