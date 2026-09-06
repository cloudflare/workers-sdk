import { DEFAULT_COMPAT_DATE } from "@cloudflare/workers-utils";
import {
	getLatestTypesEntrypoint,
	getWorkerdCompatibilityDate,
} from "helpers/compatDate";
import { beforeEach, describe, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { mockSpinner, mockWorkersTypesDirectory } from "./mocks";

vi.mock("helpers/files");
vi.mock("fs");
vi.mock("@cloudflare/cli-shared-helpers/interactive");

describe("Compatibility Date Helpers", () => {
	let spinner: ReturnType<typeof mockSpinner>;

	beforeEach(() => {
		spinner = mockSpinner();
	});

	describe("getWorkerdCompatibilityDate()", () => {
		test("returns the default compatibility date", async ({ expect }) => {
			const date = getWorkerdCompatibilityDate();

			expect(date).toBe(DEFAULT_COMPAT_DATE);
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
