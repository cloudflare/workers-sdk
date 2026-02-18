import os from "node:os";
import ci from "ci-info";
import { beforeEach, describe, it, vi } from "vitest";
import { checkMacOSVersion } from "../check-macos-version";

vi.mock("node:os");
vi.mock("ci-info", () => ({
	default: { isCI: false },
	isCI: false,
}));

const mockOs = vi.mocked(os);

describe("checkMacOSVersion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(ci).isCI = false;
	});

	it("should not throw on non-macOS platforms", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("linux");

		expect(() => checkMacOSVersion({ shouldThrow: true })).not.toThrow();
	});

	it("should not throw on macOS 13.5.0", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("22.6.0");

		expect(() => checkMacOSVersion({ shouldThrow: true })).not.toThrow();
	});

	it("should not throw on macOS 14.0.0", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("23.0.0");

		expect(() => checkMacOSVersion({ shouldThrow: true })).not.toThrow();
	});

	it("should not throw on macOS 13.6.0", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("22.7.0");

		expect(() => checkMacOSVersion({ shouldThrow: true })).not.toThrow();
	});

	it("should throw error on macOS 12.7.6", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("21.6.0");

		expect(() => checkMacOSVersion({ shouldThrow: true })).toThrow(
			"Unsupported macOS version: The Cloudflare Workers runtime cannot run on the current version of macOS (12.6.0)"
		);
	});

	it("should throw error on macOS 13.4.0", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("22.4.0");

		expect(() => checkMacOSVersion({ shouldThrow: true })).toThrow(
			"Unsupported macOS version: The Cloudflare Workers runtime cannot run on the current version of macOS (13.4.0)"
		);
	});

	it("should handle invalid Darwin version format gracefully", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("invalid-version");

		expect(() => checkMacOSVersion({ shouldThrow: true })).not.toThrow();
	});

	it("should handle very old Darwin versions gracefully", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("19.6.0");

		expect(() => checkMacOSVersion({ shouldThrow: true })).not.toThrow();
	});

	it("should not throw when running in CI", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		vi.mocked(ci).isCI = true;
		mockOs.release.mockReturnValue("21.6.0");

		expect(() => checkMacOSVersion({ shouldThrow: true })).not.toThrow();
	});
});

describe("checkMacOSVersion with shouldThrow=false", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(ci).isCI = false;
	});

	it("should not warn on non-macOS platforms", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("linux");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		checkMacOSVersion({ shouldThrow: false });

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("should not warn on macOS 13.5.0", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("22.6.0");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		checkMacOSVersion({ shouldThrow: false });

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("should warn on macOS 12.7.6", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("21.6.0");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		checkMacOSVersion({ shouldThrow: false });

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"⚠️  Warning: Unsupported macOS version detected (12.6.0)"
			)
		);
	});

	it("should warn on macOS 13.4.0", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("22.4.0");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		checkMacOSVersion({ shouldThrow: false });

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"⚠️  Warning: Unsupported macOS version detected (13.4.0)"
			)
		);
	});

	it("should not warn when running in CI", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		vi.mocked(ci).isCI = true;
		mockOs.release.mockReturnValue("21.6.0");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		checkMacOSVersion({ shouldThrow: false });

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("should not warn on invalid Darwin version format", ({ expect }) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		mockOs.release.mockReturnValue("invalid-version");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		checkMacOSVersion({ shouldThrow: false });

		expect(warnSpy).not.toHaveBeenCalled();
	});
});
