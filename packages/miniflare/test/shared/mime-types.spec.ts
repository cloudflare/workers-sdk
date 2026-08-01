import { test } from "vitest";
import { isCompressedByCloudflareFL } from "../../src/shared/mime-types";

test("isCompressedByCloudflareFL: matches known compressible types", ({
	expect,
}) => {
	expect(isCompressedByCloudflareFL("text/html")).toBe(true);
	expect(isCompressedByCloudflareFL("application/json")).toBe(true);
	expect(isCompressedByCloudflareFL("image/png")).toBe(false);
});

test("isCompressedByCloudflareFL: ignores Content-Type parameters", ({
	expect,
}) => {
	expect(isCompressedByCloudflareFL("text/html; charset=utf-8")).toBe(true);
});

test("isCompressedByCloudflareFL: is case-insensitive", ({ expect }) => {
	expect(isCompressedByCloudflareFL("TEXT/HTML")).toBe(true);
	expect(isCompressedByCloudflareFL("Application/JSON")).toBe(true);
	expect(isCompressedByCloudflareFL("Text/Html; charset=UTF-8")).toBe(true);
});

test("isCompressedByCloudflareFL: ignores surrounding whitespace", ({
	expect,
}) => {
	expect(isCompressedByCloudflareFL(" text/html ")).toBe(true);
	expect(isCompressedByCloudflareFL("text/html ; charset=utf-8")).toBe(true);
});

test("isCompressedByCloudflareFL: treats missing Content-Type as text/plain", ({
	expect,
}) => {
	expect(isCompressedByCloudflareFL(undefined)).toBe(true);
	expect(isCompressedByCloudflareFL(null)).toBe(true);
});
