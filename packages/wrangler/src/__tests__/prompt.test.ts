import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { vi } from "vitest";
import { UserError } from "../errors";
import { getPackageManager } from "../package-manager";
import { getWranglerTmpDir } from "../paths";
import {
	generateOpencodeConfig,
	generateSystemPrompt,
} from "../prompt/config-generator";
import {
	detectOpencode,
	installOpencode,
	upgradeOpencode,
} from "../prompt/opencode-manager";
import type { Mock } from "vitest";

vi.mock("execa");
vi.mock("node:fs/promises");
vi.mock("../package-manager");
vi.mock("../paths");

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

describe("installOpencode()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("should install with detected package manager", () => {
		it("npm", async () => {
			vi.mocked(getPackageManager as Mock).mockResolvedValueOnce({
				type: "npm",
			});
			vi.mocked(execa as Mock).mockResolvedValueOnce({
				stdout: null,
				stderr: null,
			});

			await installOpencode();

			expect(execa).toHaveBeenCalledWith("npm", [
				"install",
				"-g",
				"opencode-ai@latest",
			]);
		});

		it("yarn", async () => {
			vi.mocked(getPackageManager as Mock).mockResolvedValueOnce({
				type: "yarn",
			});
			vi.mocked(execa as Mock).mockResolvedValueOnce({
				stdout: null,
				stderr: null,
			});

			await installOpencode();

			expect(execa).toHaveBeenCalledWith("yarn", [
				"global",
				"add",
				"opencode-ai@latest",
			]);
		});

		it("pnpm", async () => {
			vi.mocked(getPackageManager as Mock).mockResolvedValueOnce({
				type: "pnpm",
			});
			vi.mocked(execa as Mock).mockResolvedValueOnce({
				stdout: null,
				stderr: null,
			});

			await installOpencode();

			expect(execa).toHaveBeenCalledWith("pnpm", [
				"add",
				"-g",
				"opencode-ai@latest",
			]);
		});
	});

	it("should throw UserError when install command fails", async () => {
		vi.mocked(getPackageManager as Mock).mockResolvedValue({
			type: "npm",
		});
		vi.mocked(execa as Mock).mockRejectedValue(new Error("Install failed"));

		await expect(() => installOpencode()).rejects.toThrowError(UserError);
		await expect(() =>
			installOpencode()
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Failed to install opencode. Please run 'npm install -g opencode-ai@latest' manually.]`
		);

		expect(execa).toHaveBeenCalledWith("npm", [
			"install",
			"-g",
			"opencode-ai@latest",
		]);
	});

	it("should throw UserError with correct command when pnpm install fails", async () => {
		vi.mocked(getPackageManager as Mock).mockResolvedValue({
			type: "pnpm",
		});
		vi.mocked(execa as Mock).mockRejectedValue(new Error("Install failed"));

		await expect(() =>
			installOpencode()
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Failed to install opencode. Please run 'pnpm add -g opencode-ai@latest' manually.]`
		);
	});
});

describe("generateOpencodeConfig()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should generate config file", async () => {
		const mockTmpDir = { path: "/dev/null/wrangler-opencode" };
		const projectPath = "/project";
		const expectedConfigPath = path.join(mockTmpDir.path, "opencode.json");

		vi.mocked(getWranglerTmpDir as Mock).mockReturnValue(mockTmpDir);
		vi.mocked(fs.writeFile as Mock).mockResolvedValue(undefined);

		const result = await generateOpencodeConfig(projectPath);

		expect(result).toBe(expectedConfigPath);
		expect(getWranglerTmpDir).toHaveBeenCalledWith(projectPath, "opencode");
		expect(fs.writeFile).toHaveBeenCalledWith(
			expectedConfigPath,
			expect.stringContaining('"$schema": "https://opencode.ai/config.json"'),
			"utf8"
		);

		const writeFileCall = vi.mocked(fs.writeFile as Mock).mock.calls[0];
		const configContent = JSON.parse(writeFileCall[1]);
		expect(configContent).toMatchInlineSnapshot(`
			Object {
			  "$schema": "https://opencode.ai/config.json",
			  "agent": Object {
			    "cloudflare": Object {
			      "description": "Cloudflare Workers development specialist",
			      "mode": "primary",
			      "prompt": "You are a helpful AI assistant specialized in Cloudflare Workers development.
			You are an expert in Cloudflare Workers development, deployment, troubleshooting, and following Cloudflare best practices.

			<project-info>

			</project-info>

			<rules>
			- ALWAYS run wrangler using the package manager (e.g. npx wrangler), NEVER use global wrangler.
			</rules>",
			    },
			  },
			  "mcp": Object {
			    "cloudflare-docs": Object {
			      "type": "remote",
			      "url": "https://docs.mcp.cloudflare.com/mcp",
			    },
			  },
			}
		`);
	});

	it("should throw error when file write fails", async () => {
		const mockTmpDir = { path: "/dev/null/wrangler-opencode" };
		const projectPath = "/project";

		vi.mocked(getWranglerTmpDir as Mock).mockReturnValue(mockTmpDir);
		vi.mocked(fs.writeFile as Mock).mockRejectedValue(
			new Error("Permission denied")
		);

		await expect(generateOpencodeConfig(projectPath)).rejects.toThrow(
			"Permission denied"
		);
	});
});
