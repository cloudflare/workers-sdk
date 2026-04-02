import {
	getLatestTypesEntrypoint,
	getWorkerdCompatibilityDate,
} from "helpers/compatDate";
import { beforeEach, describe, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { mockSpinner, mockWorkersTypesDirectory } from "./mocks";

vi.mock("helpers/files");
vi.mock("fs");
vi.mock("@cloudflare/cli/interactive");

describe("Compatibility Date Helpers", () => {
	let spinner: ReturnType<typeof mockSpinner>;

	beforeEach(() => {
		spinner = mockSpinner();
	});

	describe("getWorkerdCompatibilityDate()", () => {
		test("returns today's date", async ({ expect }) => {
			const date = getWorkerdCompatibilityDate("./my-app");

			expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(expect.stringContaining(date));
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
