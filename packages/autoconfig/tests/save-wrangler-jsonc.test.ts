import { readFileSync } from "node:fs";
import { NODEJS_COMPAT_DEFAULT_ON_DATE } from "@cloudflare/workers-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { saveWranglerJsonc } from "../src/run";
import type { RawConfig } from "@cloudflare/workers-utils";

/** A date before `nodejs_compat` is enabled by the compatibility date alone. */
const DATE_BEFORE_DEFAULT_ON = "2025-01-01";

function readWrittenConfig(): RawConfig {
	return JSON.parse(
		readFileSync(`${process.cwd()}/wrangler.jsonc`, "utf8")
	) as RawConfig;
}

describe("autoconfig run - saveWranglerJsonc()", () => {
	runInTempDir();

	test("drops a nodejs_compat left behind by the framework's own scaffolder", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "worker-name",
				compatibility_date: DATE_BEFORE_DEFAULT_ON,
				compatibility_flags: ["nodejs_compat"],
			}),
		});

		await saveWranglerJsonc(process.cwd(), {
			name: "worker-name",
			compatibility_date: NODEJS_COMPAT_DEFAULT_ON_DATE,
		});

		// The date we write already enables it, so specifying it as well would be
		// a workerd validation error.
		expect(readWrittenConfig()).toStrictEqual({
			name: "worker-name",
			compatibility_date: NODEJS_COMPAT_DEFAULT_ON_DATE,
		});
	});

	test("keeps unrelated flags from the existing config while dropping the redundant one", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "worker-name",
				compatibility_date: DATE_BEFORE_DEFAULT_ON,
				compatibility_flags: ["nodejs_compat", "no_global_navigator"],
			}),
		});

		await saveWranglerJsonc(process.cwd(), {
			compatibility_date: NODEJS_COMPAT_DEFAULT_ON_DATE,
		});

		expect(readWrittenConfig().compatibility_flags).toStrictEqual([
			"no_global_navigator",
		]);
	});

	test("still adds nodejs_compat for a date that does not enable it", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "worker-name",
			}),
		});

		await saveWranglerJsonc(process.cwd(), {
			compatibility_date: DATE_BEFORE_DEFAULT_ON,
		});

		expect(readWrittenConfig().compatibility_flags).toStrictEqual([
			"nodejs_compat",
		]);
	});

	test("writes the config when the project has none yet", async ({
		expect,
	}) => {
		await saveWranglerJsonc(process.cwd(), {
			name: "worker-name",
			compatibility_date: NODEJS_COMPAT_DEFAULT_ON_DATE,
		});

		expect(readWrittenConfig()).toStrictEqual({
			name: "worker-name",
			compatibility_date: NODEJS_COMPAT_DEFAULT_ON_DATE,
		});
	});
});
