import { execa } from "execa";
import { vi } from "vitest";
import { UserError } from "../errors";
import { detectOpencode, upgradeOpencode } from "../prompt/opencode-manager";
import type { Mock } from "vitest";

describe("detectOpencode()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return version string when opencode command succeeds", async () => {
		const mockVersion = "v1.2.3";

		vi.mocked(execa as Mock).mockResolvedValueOnce({
			stdout: `  ${mockVersion}  `,
			stderr: "",
		});

		const res = await detectOpencode();

		expect(res).toBe(mockVersion);
		expect(execa).toHaveBeenCalledWith("opencode", ["--version"]);
	});

	it("should trim whitespace from stdout", async () => {
		const mockVersion = "v2.0.0";

		vi.mocked(execa as Mock).mockResolvedValueOnce({
			stdout: `\n\t  ${mockVersion}  \n\t`,
			stderr: "",
		});

		const res = await detectOpencode();

		expect(res).toBe(mockVersion);
	});

	it("should return null when opencode command fails", async () => {
		vi.mocked(execa as Mock).mockRejectedValueOnce(
			new Error("Command not found")
		);

		const res = await detectOpencode();

		expect(res).toBeNull();
		expect(execa).toHaveBeenCalledWith("opencode", ["--version"]);
	});

	it("should return null when opencode command throws any error", async () => {
		vi.mocked(execa as Mock).mockRejectedValueOnce(
			new Error("Permission denied")
		);

		const res = await detectOpencode();

		expect(res).toBeNull();
	});

	it("should return empty string when opencode returns empty version", async () => {
		vi.mocked(execa as Mock).mockResolvedValueOnce({
			stdout: "",
			stderr: "",
		});

		const res = await detectOpencode();

		expect(res).toBe("");
	});

	it("should handle stdout with only whitespace", async () => {
		vi.mocked(execa as Mock).mockResolvedValueOnce({
			stdout: "   \n\t  ",
			stderr: "",
		});

		const res = await detectOpencode();

		expect(res).toBe("");
	});
});

describe("upgradeOpencode()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should call execa with opencode upgrade", async () => {
		vi.mocked(execa as Mock).mockReturnValueOnce({
			stdout: null,
			stderr: null,
		});

		await upgradeOpencode();

		expect(execa).toHaveBeenCalledWith("opencode", ["upgrade"]);
	});

	it("should throw UserError when upgrade command fails", async () => {
		vi.mocked(execa as Mock).mockRejectedValue(new Error("Command failed"));

		await expect(() => upgradeOpencode()).rejects.toThrowError(UserError);
		await expect(() =>
			upgradeOpencode()
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Failed to upgrade opencode. Please run 'opencode upgrade' manually.]`
		);

		expect(execa).toHaveBeenCalledWith("opencode", ["upgrade"]);
	});
});
