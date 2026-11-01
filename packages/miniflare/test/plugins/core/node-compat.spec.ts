import { getNodeCompat } from "miniflare";
import { test } from "vitest";

test("retains the public Node.js compatibility helper", ({ expect }) => {
	expect(getNodeCompat("2026-08-04", []).mode).toBe("v2");
	expect(getNodeCompat(undefined, []).mode).toBe(null);
});
