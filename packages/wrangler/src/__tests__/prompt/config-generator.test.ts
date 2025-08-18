import fs from "node:fs/promises";
import path from "node:path";
import { vi } from "vitest";
import { findWranglerConfig } from "../../config/config-helpers";
import { getWranglerTmpDir } from "../../paths";
import {
	generateOpencodeConfig,
	generateSystemPrompt,
} from "../../prompt/config-generator";
import type { Mock } from "vitest";

vi.mock("node:fs/promises");
vi.mock("../../config/config-helpers");
vi.mock("../../paths");

describe("generateSystemPrompt()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should include config file info when config exists", () => {
		const projectPath = "/project";
		const configPath = "/project/wrangler.toml";

		vi.mocked(findWranglerConfig as Mock).mockReturnValue({
			userConfigPath: configPath,
		});

		const prompt = generateSystemPrompt(projectPath);

		expect(findWranglerConfig).toHaveBeenCalledWith(projectPath);
		expect(prompt).toMatchInlineSnapshot(`
			"You are a helpful AI assistant specialized in Cloudflare Workers development.
			You are an expert in Cloudflare Workers development, deployment, troubleshooting, and following Cloudflare best practices.

			<project-info>
			- Wrangler config file: /project/wrangler.toml
			</project-info>

			<rules>
			- ALWAYS run wrangler using the package manager (e.g. npx wrangler), NEVER use global wrangler.
			</rules>"
		`);
	});

	it("should omit config file info when no config exists", () => {
		const projectPath = "/project";

		vi.mocked(findWranglerConfig as Mock).mockReturnValue({
			userConfigPath: null,
		});

		const prompt = generateSystemPrompt(projectPath);

		expect(findWranglerConfig).toHaveBeenCalledWith(projectPath);
		expect(prompt).toMatchInlineSnapshot(`
			"You are a helpful AI assistant specialized in Cloudflare Workers development.
			You are an expert in Cloudflare Workers development, deployment, troubleshooting, and following Cloudflare best practices.

			<project-info>

			</project-info>

			<rules>
			- ALWAYS run wrangler using the package manager (e.g. npx wrangler), NEVER use global wrangler.
			</rules>"
		`);
	});
});

describe("generateOpencodeConfig()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should generate config file", async () => {
		const mockTmpDir = { path: "/tmp/wrangler-opencode" };
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
		const mockTmpDir = { path: "/tmp/wrangler-opencode" };
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
