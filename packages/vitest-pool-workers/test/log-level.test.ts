import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

const simpleTest = dedent`
	import { it, expect } from "vitest";
	it("passes", () => {
		expect(true).toBe(true);
	});
`;

test("default logLevel suppresses debug messages", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig(),
		"index.test.ts": simpleTest,
	});

	const result = await vitestRun();
	await expect(result.exitCode).resolves.toBe(0);
	// Default is "info": info messages should appear, debug should not
	expect(result.stdout).toContain("[vpw:info]");
	expect(result.stdout).not.toContain("[vpw:debug]");
});

test('logLevel "verbose" shows debug messages', async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({ logLevel: "verbose" }),
		"index.test.ts": simpleTest,
	});

	const result = await vitestRun();
	await expect(result.exitCode).resolves.toBe(0);
	expect(result.stdout).toContain("[vpw:debug]");
	expect(result.stdout).toContain("[vpw:info]");
});

test('logLevel "warn" suppresses info and debug messages', async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({ logLevel: "warn" }),
		"index.test.ts": simpleTest,
	});

	const result = await vitestRun();
	await expect(result.exitCode).resolves.toBe(0);
	expect(result.stdout).not.toContain("[vpw:info]");
	expect(result.stdout).not.toContain("[vpw:debug]");
});
