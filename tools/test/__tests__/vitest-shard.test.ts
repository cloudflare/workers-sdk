import path from "node:path";
import { afterEach, describe, it, vi } from "vitest";
import { createVitest } from "vitest/node";
import { getVitestShard } from "../vitest-shard.cjs";

describe("getVitestShard", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("leaves local runs unsharded", ({ expect }) => {
		vi.stubEnv("CI_TEST_SHARD", undefined);
		expect(getVitestShard()).toBeUndefined();
	});

	it("reads the complete index and count from CI", ({ expect }) => {
		vi.stubEnv("CI_TEST_SHARD", "2/3");
		expect(getVitestShard()).toBe("2/3");
	});

	it.for([
		"",
		"0/2",
		"3/2",
		"1/0",
		"1/-2",
		"1.5/2",
		"1/2/3",
		"1/9007199254740992",
	])("rejects invalid configuration (%s)", (shard, { expect }) => {
		expect(() => getVitestShard(shard)).toThrow();
	});

	it.for(["miniflare", "wrangler"])(
		"partitions the real %s configuration without omitting or duplicating files",
		async (pkg, { expect }) => {
			const root = path.resolve(__dirname, "../../../packages", pkg);
			const partitions: string[][] = [];
			let allFiles: string[] = [];
			for (const shard of [undefined, "1/2", "2/2"]) {
				vi.stubEnv("CI_TEST_SHARD", shard);
				const ctx = await createVitest("test", { root });
				try {
					const files = await ctx.globTestSpecifications();
					if (shard === undefined) {
						expect(ctx.config.shard).toBeUndefined();
						allFiles = files.map((file) => file.moduleId);
					} else {
						expect(ctx.config.shard).toEqual({
							index: Number(shard[0]),
							count: 2,
						});
						const Sequencer = ctx.config.sequence.sequencer;
						partitions.push(
							(await new Sequencer(ctx).shard(files)).map(
								(file) => file.moduleId
							)
						);
					}
				} finally {
					await ctx.close();
				}
			}
			expect(allFiles.length).toBeGreaterThan(0);
			expect(partitions.flat().sort()).toEqual(allFiles.sort());
			expect(new Set(partitions.flat()).size).toBe(allFiles.length);
		}
	);
});
