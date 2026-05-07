import {
	getLatestTypesEntrypoint,
	getWorkerdCompatibilityDate,
} from "helpers/compatDate";
import { describe, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { mockWorkersTypesDirectory } from "./mocks";

vi.mock("helpers/files");
vi.mock("fs");

describe("Compatibility Date Helpers", () => {
	describe("getWorkerdCompatibilityDate()", () => {
		test("returns today's date", async ({ expect }) => {
			// `getWorkerdCompatibilityDate` is now a thin sync wrapper over
			// `getTodaysCompatDate()` — no spinner, no status line — because
			// the value is always today's date and there's nothing to wait
			// for. See the JSDoc on the helper for context.
			const date = getWorkerdCompatibilityDate("./my-app");
			expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
