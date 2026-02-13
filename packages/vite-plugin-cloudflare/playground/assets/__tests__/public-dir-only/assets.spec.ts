import * as fs from "node:fs";
import * as path from "node:path";
import { test, vi } from "vitest";
import {
	getResponse,
	isBuild,
	testDir,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test("fetches public directory asset", async ({ expect }) => {
	const response = await getResponse("/public-image.svg");
	const contentType = await response.headerValue("content-type");
	expect(contentType).toBe("image/svg+xml");
});

test.runIf(isBuild)(
	"deletes fallback client entry file",
	async ({ expect }) => {
		const fallbackEntryPath = path.join(
			testDir,
			"dist",
			"__cloudflare_fallback_entry__"
		);

		await vi.waitFor(() => {
			expect(fs.existsSync(fallbackEntryPath)).toBe(false);
		}, WAIT_FOR_OPTIONS);
	}
);
