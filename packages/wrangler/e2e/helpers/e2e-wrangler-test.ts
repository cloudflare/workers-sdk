import { rm } from "node:fs/promises";
import { test } from "vitest";
import { makeRoot, seed } from "./setup";
import { runWrangler } from "./wrangler";
import type { ChildProcess } from "node:child_process";

interface TestContext {
	tmpPath: string;
	seed(files: Record<string, string | Uint8Array>): Promise<void>;
	run(
		cmd: string,
		options?: Partial<Parameters<typeof runWrangler>[1]>
	): ReturnType<typeof runWrangler>;
}

export const e2eTest = test.extend<TestContext>({
	// eslint-disable-next-line no-empty-pattern
	async tmpPath({}, use) {
		const root = await makeRoot();
		await use(root);
		await rm(root, { recursive: true, maxRetries: 10 });
	},
	async seed({ tmpPath }, use) {
		await use((files) => {
			return seed(tmpPath, files);
		});
	},
	async run({ tmpPath }, use) {
		const cleanupWrangler = new Set<ChildProcess>();
		await use(
			(
				cmd: string,
				{
					debug = false,
					env = process.env,
					cwd,
				}: Partial<Parameters<typeof runWrangler>[1]> = {}
			) =>
				runWrangler(cmd, { cwd: cwd ?? tmpPath, debug, env }, cleanupWrangler)
		);
		for (const wrangler of cleanupWrangler) {
			wrangler.kill();
		}
		cleanupWrangler.clear();
	},
});
