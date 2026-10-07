import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { usesCfCli } from "../config";

describe("usesCfCli", () => {
	runInTempDir();

	test("is true when the project has a cloudflare.config.ts file", ({
		expect,
	}) => {
		const ctx = createTestContext();
		ctx.project.path = process.cwd();
		writeFileSync(join(ctx.project.path, "cloudflare.config.ts"), "");

		expect(usesCfCli(ctx)).toBe(true);
	});

	test("is false when the project has a Wrangler config file", ({ expect }) => {
		const ctx = createTestContext();
		ctx.project.path = process.cwd();
		writeFileSync(join(ctx.project.path, "wrangler.jsonc"), "{}");

		expect(usesCfCli(ctx)).toBe(false);
	});
});
