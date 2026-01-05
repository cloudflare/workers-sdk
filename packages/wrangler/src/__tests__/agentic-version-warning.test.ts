import { beforeEach, describe, expect, it, vi } from "vitest";
import * as agenticCheck from "../agentic-check";
import { checkAgenticVersionWarning } from "../agentic-version-warning";
import * as configCache from "../config-cache";
import * as dialogs from "../dialogs";
import * as isCIModule from "../is-ci";
import * as isInteractiveModule from "../is-interactive";
import * as packageManager from "../package-manager";
import * as updateCheckModule from "../update-check";
import { mockConsoleMethods } from "./helpers/mock-console";

vi.mock("../agentic-check");
vi.mock("../update-check");
vi.mock("../config-cache");
vi.mock("../dialogs");
vi.mock("../is-ci");
vi.mock("../is-interactive");
vi.mock("../package-manager");

// Mock the wrangler version
vi.mock("../../package.json", () => ({
	version: "3.50.0",
}));

describe("agentic version warning", () => {
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(configCache.getConfigCache).mockReturnValue({});
		vi.mocked(packageManager.sniffUserAgent).mockReturnValue("npm");
		vi.mocked(isCIModule.CI.isCI).mockReturnValue(false);
	});

	describe("when in CI environment", () => {
		it("should return true and skip all checks", async () => {
			vi.mocked(isCIModule.CI.isCI).mockReturnValue(true);
			vi.mocked(agenticCheck.detectAgenticEnvironment).mockReturnValue({
				isAgentic: true,
				name: "Claude Code",
			});
			vi.mocked(updateCheckModule.updateCheck).mockResolvedValue("4.0.0");

			const result = await checkAgenticVersionWarning();

			expect(result).toBe(true);
			// Should not even check for agentic environment or update
			expect(configCache.saveToConfigCache).not.toHaveBeenCalled();
			expect(std.err).toBe("");
			expect(std.warn).toBe("");
		});
	});

	describe("when not in agentic environment", () => {
		it("should return true and not show warning", async () => {
			vi.mocked(agenticCheck.detectAgenticEnvironment).mockReturnValue({
				isAgentic: false,
				name: null,
			});

			const result = await checkAgenticVersionWarning();

			expect(result).toBe(true);
			expect(configCache.saveToConfigCache).not.toHaveBeenCalled();
			expect(std.err).toBe("");
			expect(std.warn).toBe("");
		});
	});

	describe("when in agentic environment", () => {
		beforeEach(() => {
			vi.mocked(agenticCheck.detectAgenticEnvironment).mockReturnValue({
				isAgentic: true,
				name: "Claude Code",
			});
		});

		describe("and version check fails", () => {
			it("should return true and not show warning", async () => {
				vi.mocked(updateCheckModule.updateCheck).mockResolvedValue(undefined);

				const result = await checkAgenticVersionWarning();

				expect(result).toBe(true);
				expect(configCache.saveToConfigCache).not.toHaveBeenCalled();
			});
		});

		describe("and on latest major version", () => {
			it("should return true and not show warning", async () => {
				vi.mocked(updateCheckModule.updateCheck).mockResolvedValue("3.60.0"); // Same major (3)

				const result = await checkAgenticVersionWarning();

				expect(result).toBe(true);
				expect(configCache.saveToConfigCache).not.toHaveBeenCalled();
			});
		});

		describe("and major version behind", () => {
			beforeEach(() => {
				vi.mocked(updateCheckModule.updateCheck).mockResolvedValue("4.0.0"); // Major version ahead
			});

			describe("and warning already shown for this major", () => {
				it("should return true and not show warning again", async () => {
					vi.mocked(configCache.getConfigCache).mockReturnValue({
						warningShownForMajor: 4,
					});

					const result = await checkAgenticVersionWarning();

					expect(result).toBe(true);
					expect(configCache.saveToConfigCache).not.toHaveBeenCalled();
				});
			});

			describe("and warning not yet shown", () => {
				describe("in interactive mode", () => {
					beforeEach(() => {
						vi.mocked(isInteractiveModule.default).mockReturnValue(true);
					});

					it("should show human-friendly warning and prompt user", async () => {
						vi.mocked(dialogs.confirm).mockResolvedValue(true);

						const result = await checkAgenticVersionWarning();

						expect(result).toBe(true);
						expect(std.warn).toContain("OUTDATED WRANGLER VERSION");
						expect(std.warn).toContain("Claude Code");
						expect(configCache.saveToConfigCache).toHaveBeenCalledWith(
							"wrangler-agentic.json",
							{ warningShownForMajor: 4 }
						);
						expect(dialogs.confirm).toHaveBeenCalled();
					});

					it("should return false if user declines to continue", async () => {
						vi.mocked(dialogs.confirm).mockResolvedValue(false);

						const result = await checkAgenticVersionWarning();

						expect(result).toBe(false);
					});
				});

				describe("in non-interactive mode", () => {
					beforeEach(() => {
						vi.mocked(isInteractiveModule.default).mockReturnValue(false);
					});

					it("should show LLM-friendly XML output and return false", async () => {
						const result = await checkAgenticVersionWarning();

						expect(result).toBe(false);
						expect(std.err).toContain("<wrangler_version_error>");
						expect(std.err).toContain(
							"<current_version>3.50.0</current_version>"
						);
						expect(std.err).toContain("<latest_version>4.0.0</latest_version>");
						expect(std.err).toContain("<current_major>3</current_major>");
						expect(std.err).toContain("<latest_major>4</latest_major>");
						expect(std.err).toContain(
							"<detected_environment>Claude Code</detected_environment>"
						);
						expect(std.err).toContain(
							"<update_command>npm install wrangler@latest</update_command>"
						);
						expect(std.err).toContain("<action_required>");
						expect(configCache.saveToConfigCache).toHaveBeenCalledWith(
							"wrangler-agentic.json",
							{ warningShownForMajor: 4 }
						);
						expect(dialogs.confirm).not.toHaveBeenCalled();
					});
				});
			});
		});
	});

	describe("package manager detection", () => {
		beforeEach(() => {
			vi.mocked(agenticCheck.detectAgenticEnvironment).mockReturnValue({
				isAgentic: true,
				name: "Claude Code",
			});
			vi.mocked(updateCheckModule.updateCheck).mockResolvedValue("4.0.0");
			vi.mocked(isInteractiveModule.default).mockReturnValue(false);
		});

		it("should show npm install command for npm", async () => {
			vi.mocked(packageManager.sniffUserAgent).mockReturnValue("npm");

			await checkAgenticVersionWarning();

			expect(std.err).toContain("npm install wrangler@latest");
		});

		it("should show pnpm add command for pnpm", async () => {
			vi.mocked(packageManager.sniffUserAgent).mockReturnValue("pnpm");

			await checkAgenticVersionWarning();

			expect(std.err).toContain("pnpm add wrangler@latest");
		});

		it("should show yarn add command for yarn", async () => {
			vi.mocked(packageManager.sniffUserAgent).mockReturnValue("yarn");

			await checkAgenticVersionWarning();

			expect(std.err).toContain("yarn add wrangler@latest");
		});

		it("should show bun add command for bun", async () => {
			vi.mocked(packageManager.sniffUserAgent).mockReturnValue("bun");

			await checkAgenticVersionWarning();

			expect(std.err).toContain("bun add wrangler@latest");
		});

		it("should default to npm for unknown package manager", async () => {
			vi.mocked(packageManager.sniffUserAgent).mockReturnValue(undefined);

			await checkAgenticVersionWarning();

			expect(std.err).toContain("npm install wrangler@latest");
		});
	});
});
