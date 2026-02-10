import * as fs from "node:fs";
import * as path from "node:path";
import { test, vi } from "vitest";
import { isBuild, testDir, WAIT_FOR_OPTIONS } from "../../../__test-utils__";
import "../base-tests";

test.runIf(isBuild)(
	"deletes fallback client entry file",
	async ({ expect }) => {
		const fallbackEntryPath = path.join(
			testDir,
			"dist",
			"client",
			"__cloudflare_fallback_entry__"
		);

		await vi.waitFor(() => {
			expect(fs.existsSync(fallbackEntryPath)).toBe(false);
		}, WAIT_FOR_OPTIONS);
	}
);
