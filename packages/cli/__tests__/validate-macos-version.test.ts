import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateMacOSVersion } from "../validate-macos-version";

vi.mock("node:os");

const mockOs = vi.mocked(os);

describe("validateMacOSVersion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	it("should not throw on non-macOS platforms", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("linux");

		expect(() => validateMacOSVersion()).not.toThrow();
	});

	it("should not throw on macOS 13.5.0", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("22.6.0");

		expect(() => validateMacOSVersion()).not.toThrow();
	});

	it("should not throw on macOS 14.0.0", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("23.0.0");

		expect(() => validateMacOSVersion()).not.toThrow();
	});

	it("should not throw on macOS 13.6.0", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("22.7.0");

		expect(() => validateMacOSVersion()).not.toThrow();
	});

	it("should throw error on macOS 12.7.6", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		vi.stubEnv("CI", "");
		mockOs.release.mockReturnValue("21.6.0");

		expect(() => validateMacOSVersion()).toThrow(
			"Unsupported macOS version: We don't support the current version of macOS (12.6.0)"
		);
	});

	it("should throw error on macOS 13.4.0", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		vi.stubEnv("CI", "");
		mockOs.release.mockReturnValue("22.4.0");

		expect(() => validateMacOSVersion()).toThrow(
			"Unsupported macOS version: We don't support the current version of macOS (13.4.0)"
		);
	});

	it("should handle invalid Darwin version format gracefully", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("invalid-version");

		expect(() => validateMacOSVersion()).not.toThrow();
	});

	it("should handle very old Darwin versions gracefully", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("19.6.0");

		expect(() => validateMacOSVersion()).not.toThrow();
	});

	it("should not throw when CI environment variable is set", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		vi.stubEnv("CI", "true");
		mockOs.release.mockReturnValue("21.6.0");

		expect(() => validateMacOSVersion()).not.toThrow();
	});
});
