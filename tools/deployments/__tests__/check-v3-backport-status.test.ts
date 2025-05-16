import { describe, expect, it, vi } from "vitest";
import { validateBackportPR } from "../check-v3-backport-status";

describe("validateBackportPR", () => {
	it("should return false if the branch name does not match the pattern", () => {
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const result = validateBackportPR("example/v3-backport-demo", () => {
			throw new Error("Unexpected");
		});

		expect(result).toBe(false);
		expect(consoleLog).not.toBeCalled();
		expect(consoleError).toBeCalledWith(
			`❌ Branch name "example/v3-backport-demo" does not match the expected pattern "v3-backport-<PR_NUMBER>"`
		);
	});

	it("should return false if the original PR is not merged", () => {
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const isMergedMock = vi.fn(() => false);
		const result = validateBackportPR("v3-backport-13579", isMergedMock);

		expect(result).toBe(false);
		expect(isMergedMock).toBeCalledWith("13579");
		expect(consoleLog).toBeCalledWith(`🔍 Checking if PR #13579 is merged...`);
		expect(consoleError).toBeCalledWith(`❌ PR #13579 is not merged.`);
	});

	it("should return true if the original PR is merged", () => {
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		const isMergedMock = vi.fn(() => true);
		const result = validateBackportPR("v3-backport-2468", isMergedMock);

		expect(result).toBe(true);
		expect(isMergedMock).toBeCalledWith("2468");
		expect(consoleLog).toBeCalledWith(`🔍 Checking if PR #2468 is merged...`);
		expect(consoleLog).toBeCalledWith(`✅ PR #2468 is merged.`);
	});
});
