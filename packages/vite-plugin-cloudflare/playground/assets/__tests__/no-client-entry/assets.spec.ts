import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, vi } from "vitest";
import {
	isBuild,
	isVite8,
	testDir,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";
import "../base-tests";

test.runIf(isBuild && !isVite8)(
	"deletes fallback client entry file",
	async () => {
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
