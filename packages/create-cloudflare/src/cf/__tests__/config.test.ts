import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { usesCfCli } from "../config";

describe("usesCfCli", () => {
	runInTempDir();

	test("is true when the project has a cloudflare.config.ts file", ({
		expect,
	}) => {
		writeFileSync(join(process.cwd(), "cloudflare.config.ts"), "");

		expect(usesCfCli(process.cwd())).toBe(true);
	});

	test("is false when the project has a Wrangler config file", ({ expect }) => {
		writeFileSync(join(process.cwd(), "wrangler.jsonc"), "{}");

		expect(usesCfCli(process.cwd())).toBe(false);
	});
});
