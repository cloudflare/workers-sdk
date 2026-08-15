import { getTodaysCompatDate } from "@cloudflare/workers-utils";
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
// The bundled workerd supports compatibility dates up to 2026-08-11.
vi.mock("workerd/package.json", () => ({ version: "1.20260811.1" }));
vi.mock("@cloudflare/workers-utils", () => ({
	getTodaysCompatDate: vi.fn(),
	isCompatDate: (str: string) => /^\d{4}-\d{2}-\d{2}$/.test(str),
}));

describe("Compatibility Date Helpers", () => {
	let spinner: ReturnType<typeof mockSpinner>;

	beforeEach(() => {
		spinner = mockSpinner();
	});

	describe("getWorkerdCompatibilityDate()", () => {
		test("returns today's date when the bundled workerd supports it", async ({
			expect,
		}) => {
			vi.mocked(getTodaysCompatDate).mockReturnValue("2026-08-05");

			const date = getWorkerdCompatibilityDate("./my-app");

			expect(date).toBe("2026-08-05");
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(expect.stringContaining(date));
		});

		test("clamps to the newest date the bundled workerd supports", async ({
			expect,
		}) => {
			// Today is ahead of what the bundled workerd supports, so a project
			// scaffolded with today's date would fail to start on its first `dev`.
			vi.mocked(getTodaysCompatDate).mockReturnValue("2026-08-15");

			const date = getWorkerdCompatibilityDate("./my-app");

			expect(date).toBe("2026-08-11");
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
