import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, vi } from "vitest";

import { isBuild, testDir } from "../../../__test-utils__";
import "../base-tests";

test.runIf(isBuild)("deletes fallback client entry file", async () => {
	const fallbackEntryPath = path.join(
		testDir,
		"dist",
		"client",
		"__cloudflare_fallback_entry__"
	);

	await vi.waitFor(() => {
		expect(fs.existsSync(fallbackEntryPath)).toBe(false);
	});
});
