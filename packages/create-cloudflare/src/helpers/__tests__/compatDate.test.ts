import { createRequire } from "node:module";
import {
	getLatestTypesEntrypoint,
	getWorkerdCompatibilityDate,
} from "helpers/compatDate";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { mockSpinner, mockWorkersTypesDirectory } from "./mocks";

vi.mock("helpers/files");
vi.mock("fs");
vi.mock("@cloudflare/cli/interactive");
vi.mock("node:module");

describe("Compatibility Date Helpers", () => {
	let spinner: ReturnType<typeof mockSpinner>;

	beforeEach(() => {
		spinner = mockSpinner();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getWorkerdCompatibilityDate()", () => {
		test("normal flow", async ({ expect }) => {
			const mockWrangler = {
				getLocalWorkerdCompatibilityDate: () => "2025-01-10",
			};
			vi.mocked(createRequire).mockReturnValue(
				(() => mockWrangler) as unknown as NodeJS.Require,
			);

			const date = getWorkerdCompatibilityDate("./my-app");

			const expectedDate = "2025-01-10";
			expect(date).toBe(expectedDate);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(
				expect.stringContaining(expectedDate),
			);
		});

		test("fallback on error", async ({ expect }) => {
			vi.mocked(createRequire).mockReturnValue((() => {
				throw new Error("Cannot find module 'wrangler'");
			}) as unknown as NodeJS.Require);

			const date = getWorkerdCompatibilityDate("./my-app");

			const fallbackDate = "2026-02-04";
			expect(date).toBe(fallbackDate);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(
				expect.stringContaining(fallbackDate),
			);
		});
	});

	describe("getLatestTypesEntrypoint", () => {
		const ctx = createTestContext();

		test("happy path", async ({ expect }) => {
			mockWorkersTypesDirectory();

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe("2023-07-01");
		});

		test("read error", async ({ expect }) => {
			mockWorkersTypesDirectory(() => {
				throw new Error("ENOENT: no such file or directory");
			});

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe(null);
		});

		test("empty directory", async ({ expect }) => {
			mockWorkersTypesDirectory(() => []);

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe(null);
		});

		test("no compat dates found", async ({ expect }) => {
			mockWorkersTypesDirectory(() => ["foo", "bar"]);

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe(null);
		});
	});
});
