import * as fs from "node:fs/promises";
import { FormData } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as checkCommands from "../check/commands";
import { UserError } from "../errors";
import { logger } from "../logger";
import { ParseError } from "../parse";
import * as paths from "../paths";
import {
	handleStartupError,
	helpIfErrorIsSizeOrScriptStartup,
} from "../utils/friendly-validator-errors";

vi.mock("../logger");
vi.mock("../check/commands", () => ({
	analyseBundle: vi.fn(),
}));
vi.mock("../paths", () => ({
	getWranglerTmpDir: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
	writeFile: vi.fn(),
}));

const mockAnalyseBundle = vi.mocked(checkCommands.analyseBundle);
const mockGetWranglerTmpDir = vi.mocked(paths.getWranglerTmpDir);
const mockWriteFile = vi.mocked(fs.writeFile);

describe("friendly-validator-errors", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetWranglerTmpDir.mockResolvedValue({
			path: "/tmp/test",
			remove: vi.fn(),
		});
		mockWriteFile.mockResolvedValue(undefined);
	});

	describe("helpIfErrorIsSizeOrScriptStartup", () => {
		it("reports startup error before attempting profiling", async () => {
			const startupError = new ParseError({
				text: "Validation failed",
				notes: [{ text: "Script startup exceeded CPU limit." }],
			});
			Object.assign(startupError, { code: 10021 });

			mockAnalyseBundle.mockRejectedValue(
				new Error("workerd profiling failed")
			);
			const mockFormData = new FormData();

			await expect(
				helpIfErrorIsSizeOrScriptStartup(
					startupError,
					{},
					mockFormData,
					"/test"
				)
			).rejects.toThrow(UserError);

			expect(logger.error).toHaveBeenCalledWith(
				"Worker startup failed:",
				"Script startup exceeded CPU limit."
			);

			expect(logger.debug).toHaveBeenCalledWith(
				"CPU profiling failed during deployment error handling:",
				expect.any(Error)
			);
		});

		it("handles startup errors with missing notes gracefully", async () => {
			const startupError = new ParseError({
				text: "Script startup exceeded CPU limit.",
				notes: [{ text: "Script startup exceeded CPU limit." }],
			});
			Object.assign(startupError, { code: 10021 });

			mockAnalyseBundle.mockRejectedValue(
				new Error("workerd profiling failed")
			);
			const mockFormData = new FormData();

			await expect(
				helpIfErrorIsSizeOrScriptStartup(
					startupError,
					{},
					mockFormData,
					"/test"
				)
			).rejects.toThrow(UserError);

			expect(logger.error).toHaveBeenCalledWith(
				"Worker startup failed:",
				"Script startup exceeded CPU limit."
			);
		});

		it("does not interfere with size errors", async () => {
			const sizeError = { code: 10027 };
			const mockDependencies = { "test.js": { bytesInOutput: 1000 } };

			await helpIfErrorIsSizeOrScriptStartup(
				sizeError,
				mockDependencies,
				new FormData(),
				"/test"
			);

			expect(logger.error).not.toHaveBeenCalled();
		});
	});

	describe("handleStartupError", () => {
		it("includes profile information when profiling succeeds", async () => {
			const mockProfile = { nodes: [], samples: [] };
			mockAnalyseBundle.mockResolvedValue(mockProfile);

			try {
				await handleStartupError("test-bundle", "/test/project", false);
				expect.fail("Expected UserError to be thrown");
			} catch (thrownError) {
				expect(thrownError).toBeInstanceOf(UserError);
				expect((thrownError as UserError).message).toContain("CPU Profile");
				expect((thrownError as UserError).message).toContain(
					"worker.cpuprofile"
				);
			}
		});

		it("handles profiling failures silently for deployment errors", async () => {
			mockAnalyseBundle.mockRejectedValue(new Error("profiling failed"));

			await expect(
				handleStartupError("test-bundle", "/test/project", false)
			).rejects.toThrow(UserError);

			expect(logger.debug).toHaveBeenCalledWith(
				"CPU profiling failed during deployment error handling:",
				expect.any(Error)
			);

			const thrownError = await handleStartupError(
				"test-bundle",
				"/test/project",
				false
			).catch((e) => e);
			expect(thrownError.message).not.toContain("CPU Profile");
			expect(thrownError.message).toContain("exceeded startup limits");
		});

		it("reports profiling failures for manual profiling", async () => {
			const profilingError = new Error("manual profiling failed");
			mockAnalyseBundle.mockRejectedValue(profilingError);

			await expect(
				handleStartupError("test-bundle", "/test/project", true)
			).rejects.toThrow(profilingError);

			expect(logger.debug).not.toHaveBeenCalled();
		});

		it("uses relative paths for profile output", async () => {
			const mockProfile = { nodes: [], samples: [] };
			mockAnalyseBundle.mockResolvedValue(mockProfile);
			mockGetWranglerTmpDir.mockResolvedValue({
				path: "/test/project/.wrangler/tmp/startup-profile-123",
				remove: vi.fn(),
			});

			try {
				await handleStartupError("test-bundle", "/test/project", false);
				expect.fail("Expected UserError to be thrown");
			} catch (thrownError) {
				expect(thrownError).toBeInstanceOf(UserError);
				expect((thrownError as UserError).message).toContain(
					"worker.cpuprofile"
				);
				expect((thrownError as UserError).message).toContain(
					"startup-profile-123"
				);
				expect((thrownError as UserError).message).not.toContain(
					"/test/project"
				);
			}
		});
	});
});
