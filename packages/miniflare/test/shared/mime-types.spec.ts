import { test } from "vitest";
import { isCompressedByCloudflareFL } from "../../src/shared/mime-types";

test("isCompressedByCloudflareFL: matches known content types", ({ expect }) => {
	expect(isCompressedByCloudflareFL("text/html")).toBe(true);
	expect(isCompressedByCloudflareFL("application/json")).toBe(true);
	expect(isCompressedByCloudflareFL("image/png")).toBe(false);
});

test("isCompressedByCloudflareFL: ignores parameters after the media type", ({
	expect,
}) => {
	expect(isCompressedByCloudflareFL("text/html;charset=utf-8")).toBe(true);
});

test("isCompressedByCloudflareFL: is case-insensitive", ({ expect }) => {
	expect(isCompressedByCloudflareFL("Application/JSON")).toBe(true);
	expect(isCompressedByCloudflareFL("TEXT/HTML")).toBe(true);
});

test("isCompressedByCloudflareFL: allows whitespace before the parameter separator", ({
	expect,
}) => {
	expect(isCompressedByCloudflareFL("text/html ; charset=utf-8")).toBe(true);
});

test("isCompressedByCloudflareFL: treats a missing content type as compressible", ({
	expect,
}) => {
	expect(isCompressedByCloudflareFL(undefined)).toBe(true);
	expect(isCompressedByCloudflareFL(null)).toBe(true);
	expect(isCompressedByCloudflareFL("")).toBe(true);
});
