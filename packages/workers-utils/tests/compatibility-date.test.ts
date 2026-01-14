import module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, it, vi } from "vitest";
import { getLocalWorkerdCompatibilityDate } from "../src/compatibility-date";

describe("getLocalWorkerdCompatibilityDate", () => {
	beforeEach(() => {
		vi.setSystemTime(vi.getRealSystemTime());
	});

	it("should successfully get the local latest compatibility date from a mock workerd path", ({
		expect,
	}) => {
		const createRequireSpy = vi
			.spyOn(module, "createRequire")
			.mockImplementation(() => {
				const mockedRequire = ((pkg: string) => {
					if (pkg === "workerd") {
						return { compatibilityDate: "2025-01-10" };
					}
					return {};
				}) as NodeJS.Require;
				mockedRequire.resolve = (() => "") as unknown as NodeJS.RequireResolve;
				return mockedRequire;
			});
		const { date, source } = getLocalWorkerdCompatibilityDate({
			projectPath: "/test/project",
		});
		expect(date).toBe("2025-01-10");
		expect(source).toEqual("workerd");
		// Verify createRequire is called with a file path (package.json), not just a directory
		expect(createRequireSpy).toHaveBeenCalledWith(
			path.join("/test/project", "package.json")
		);
	});

	it("should successfully get the local latest compatibility date from the local workerd instance via the wrangler package", ({
		expect,
	}) => {
		// Note: this works because Wrangler depends on `miniflare` (and therefore `workerd`)
		// in the monorepo.
		const wranglerPackageJson = fileURLToPath(
			new URL("../../wrangler/package.json", import.meta.url)
		);
		const { date, source } = getLocalWorkerdCompatibilityDate({
			projectPath: wranglerPackageJson,
		});
		expect(date).toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(source).toEqual("workerd");
	});

	it("should fallback to the fallback date if it fails to get the date from a local workerd instance", ({
		expect,
	}) => {
		const createRequireSpy = vi
			.spyOn(module, "createRequire")
			.mockImplementation(
				// This breaks the require function that createRequire generate, causing us not to find
				// the local miniflare/workerd instance
				() => ({}) as NodeJS.Require
			);
		const { date, source } = getLocalWorkerdCompatibilityDate({
			projectPath: "/test/project",
		});
		const fallbackCompatDate = "2025-09-27";
		expect(date).toEqual(fallbackCompatDate);
		expect(source).toEqual("fallback");
		// Verify createRequire is called with a file path even when resolution fails
		expect(createRequireSpy).toHaveBeenCalledWith(
			path.join("/test/project", "package.json")
		);
	});

	it("should use today's date if the local workerd's date is in the future", async ({
		expect,
	}) => {
		vi.setSystemTime("2025-01-09T23:59:59.999Z");
		vi.spyOn(module, "createRequire").mockImplementation(() => {
			const mockedRequire = ((pkg: string) => {
				if (pkg === "workerd") {
					return { compatibilityDate: "2025-01-10" };
				}
				return {};
			}) as NodeJS.Require;
			mockedRequire.resolve = (() => "") as unknown as NodeJS.RequireResolve;
			return mockedRequire;
		});
		const { date, source } = getLocalWorkerdCompatibilityDate({
			projectPath: "/test/project",
		});
		const todaysDate = "2025-01-09";
		expect(date).toEqual(todaysDate);
		expect(source).toEqual("workerd");
	});
});
