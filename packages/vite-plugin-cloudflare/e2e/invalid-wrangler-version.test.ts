import { describe, expect, test } from "vitest";
import { runLongLived, seed } from "./helpers.js";

describe("invalid Wrangler version e2e tests", () => {
	// Only test with pnpm;
	// npm and yarn don't hoist peer dependencies in the same way as pnpm;
	// so having a different peer Wrangler doesn't mess up the internal dependency
	const projectPath = seed("invalid-wrangler-version", {
		pm: "pnpm",
		useStrictPeerDeps: false,
	});

	test("`vite dev` will error when peer installed wrangler version overrides the expected internal dependency", async () => {
		const proc = await runLongLived("pnpm", "dev", projectPath);
		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr).toMatch(
			/The installed version of Wrangler \(4\.20\.0\) does not satisfy the peer dependency required by @cloudflare\/vite-plugin \(\^\d+\.\d+\.\d+\)/
		);
	});
});
