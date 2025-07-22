import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";

describe("third party tool consuming wrangler/config subpath", () => {
	beforeAll(() => {
		rmSync("./wrangler-config-analyzer/dist", {
			recursive: true,
			force: true,
		});
		execSync("pnpm build", { cwd: "./wrangler-config-analyzer" });
	});

	test("the built package should not include any miniflare code", () => {
		// Miniflare, with workerd, is one of the heaviest parts of wrangler, so
		// we do want to make sure that third party tools don't bring that in
		const packageDistIndex = readFileSync(
			"./wrangler-config-analyzer/dist/index.mjs",
			"utf-8"
		);
		const lowercasedDistIndex = packageDistIndex.toLowerCase();
		// Let's make sure the world wrangler is appears somewhere in the build file
		expect(lowercasedDistIndex).toContain("wrangler");
		// The word miniflare does not appear anywhere in the build file
		expect(lowercasedDistIndex).not.toContain("miniflare");
	});

	test("the build code should work as intended", async () => {
		// @ts-ignore - the following line will type error when/if the wrangler-config-analyzer is not built
		const pkg = await import("../wrangler-config-analyzer/dist/index.mjs");
		expect(pkg.analyzeConfig()).toEqual({
			nameOfWorker: "my-worker",
			numberOfVars: 2,
		});
	});
});
