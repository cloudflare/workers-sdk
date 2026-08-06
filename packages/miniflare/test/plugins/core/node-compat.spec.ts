import { getNodeCompat } from "miniflare";
import { test } from "vitest";

test("no flags and old date => no Node.js compat", ({ expect }) => {
	expect(getNodeCompat("2000-01-01", []).mode).toBe(null);
});

test("nodejs_compat flag with old date => v1", ({ expect }) => {
	expect(getNodeCompat("2000-01-01", ["nodejs_compat"]).mode).toBe("v1");
});

test("nodejs_compat flag on/after the v2 switch-over date => v2", ({
	expect,
}) => {
	expect(getNodeCompat("2024-09-23", ["nodejs_compat"]).mode).toBe("v2");
});

test("nodejs_compat_v2 flag => v2 regardless of date", ({ expect }) => {
	expect(getNodeCompat("2000-01-01", ["nodejs_compat_v2"]).mode).toBe("v2");
});

test("nodejs_als flag => als", ({ expect }) => {
	expect(getNodeCompat("2000-01-01", ["nodejs_als"]).mode).toBe("als");
});

test("date on/after the default-on date implies Node.js compat (v2)", ({
	expect,
}) => {
	expect(getNodeCompat("2026-08-04", []).mode).toBe("v2");
});

test("date before the default-on date does not imply Node.js compat", ({
	expect,
}) => {
	expect(getNodeCompat("2026-08-03", []).mode).toBe(null);
});

test("no_nodejs_compat opts out of the date-implied default", ({ expect }) => {
	expect(getNodeCompat("2026-08-04", ["no_nodejs_compat"]).mode).toBe(null);
});

test("no_nodejs_compat_v2 opts out of v2 but keeps date-implied v1", ({
	expect,
}) => {
	expect(getNodeCompat("2026-08-04", ["no_nodejs_compat_v2"]).mode).toBe("v1");
});

test("no_nodejs_compat takes precedence over no_nodejs_compat_v2", ({
	expect,
}) => {
	expect(
		getNodeCompat("2026-08-04", ["no_nodejs_compat", "no_nodejs_compat_v2"])
			.mode
	).toBe(null);
});

test("explicit nodejs_compat flag enables compat before the default-on date", ({
	expect,
}) => {
	expect(getNodeCompat("2025-01-01", ["nodejs_compat"]).mode).toBe("v2");
});
