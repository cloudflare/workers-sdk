import assert from "node:assert";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_COMPAT_DATE } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { test } from "vitest";
import nextTemplate from "../../templates/next/c3";
import { createTestArgs, createTestContext } from "./helpers";

runInTempDir();

test("caps generated vinext compatibility dates to the bundled workerd date", async ({
	expect,
}) => {
	const configPath = join(process.cwd(), "cloudflare.config.ts");
	writeFileSync(
		configPath,
		`export default defineConfig({
  worker: defineWorker({
    compatibilityDate: "9999-12-31",
    compatibilityFlags: ["nodejs_compat"],
  }),
  olderWorker: defineWorker({
    compatibilityDate: "2020-01-01",
    compatibilityFlags: ["nodejs_compat"],
  }),
});
`
	);
	const ctx = createTestContext("next", createTestArgs({ variant: "vinext" }));
	ctx.project.path = process.cwd();
	assert(nextTemplate.configure);

	await nextTemplate.configure(ctx);

	const config = readFileSync(configPath, "utf-8");
	expect(config).toContain(`compatibilityDate: "${DEFAULT_COMPAT_DATE}"`);
	expect(config).toContain('compatibilityDate: "2020-01-01"');
	expect(config.match(/compatibilityFlags/g)).toHaveLength(1);
	expect(config).toContain('compatibilityFlags: ["nodejs_compat"]');
});
