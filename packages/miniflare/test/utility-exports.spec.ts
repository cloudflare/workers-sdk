import * as miniflare from "miniflare";
import { test } from "vitest";

test("keeps shared tooling helpers outside the Miniflare v5 API", ({
	expect,
}) => {
	expect(miniflare).not.toHaveProperty("getNodeCompat");
	expect(miniflare).not.toHaveProperty("getFreshSourceMapSupport");
});
