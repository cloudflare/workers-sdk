import { getLocalWorkerdCompatibilityDate } from "@cloudflare/workers-utils";
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
vi.mock("@cloudflare/workers-utils");

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
			vi.mocked(getLocalWorkerdCompatibilityDate).mockReturnValue({
				date: "2025-01-10",
				source: "workerd",
			});

			const date = getWorkerdCompatibilityDate("./my-app");

			const expectedDate = "2025-01-10";
			expect(date).toBe(expectedDate);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(
				expect.stringContaining(expectedDate),
			);
		});

		test("fallback result", async ({ expect }) => {
			vi.mocked(getLocalWorkerdCompatibilityDate).mockReturnValue({
				date: "2025-09-27",
				source: "fallback",
			});

			const date = getWorkerdCompatibilityDate("./my-app");

			const fallbackDate = "2025-09-27";
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
