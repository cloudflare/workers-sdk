import { describe, test } from "vitest";
import { getEsbuildOptions } from "../plugins/config";

describe("getEsbuildOptions", () => {
	test("forces decorator lowering by default", ({ expect }) => {
		expect(getEsbuildOptions({})).toEqual({
			supported: {
				decorators: false,
			},
		});
	});

	test("preserves user esbuild options while forcing decorator lowering", ({
		expect,
	}) => {
		expect(
			getEsbuildOptions({
				esbuild: {
					jsx: "automatic",
					supported: {
						bigint: true,
						decorators: true,
					},
				},
			})
		).toEqual({
			jsx: "automatic",
			supported: {
				bigint: true,
				decorators: false,
			},
		});
	});

	test("respects explicitly disabled esbuild transforms", ({ expect }) => {
		expect(getEsbuildOptions({ esbuild: false })).toBe(false);
	});
});
