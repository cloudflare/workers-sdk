import fs from "node:fs/promises";
import path from "node:path";
import { findWranglerConfig } from "../config/config-helpers";
import { getWranglerTmpDir } from "../paths";
import { OpencodeConfig } from "./types";

export function generateSystemPrompt(projectPath: string): string {
	const { userConfigPath } = findWranglerConfig(projectPath);

	let configFileInfo = "";
	if (userConfigPath) {
		const configFileName = userConfigPath;
		configFileInfo = `Wrangler config file: ${configFileName}`;
	}

	return `
You are a helpful AI assistant specialized in Cloudflare Workers development.
You are an expert in Cloudflare Workers development, deployment, troubleshooting, and following Cloudflare best practices.

<project-info>
${configFileInfo && `- ${configFileInfo}`}
</project-info>

<rules>
- ALWAYS run wrangler using the package manager (e.g. npx wrangler), NEVER use global wrangler.
</rules>
`.trim();
}

export async function generateOpencodeConfig(
	projectPath: string
): Promise<string> {
	const tempDir = getWranglerTmpDir(projectPath, "opencode");
	const configPath = path.join(tempDir.path, "opencode.json");

	const systemPrompt = generateSystemPrompt(projectPath);

	const config: OpencodeConfig = {
		$schema: "https://opencode.ai/config.json",
		theme: "gruvbox",
		agent: {
			cloudflare: {
				prompt: systemPrompt,
				mode: "primary",
				description: "Cloudflare Workers development specialist",
			},
		},
		mcp: {
			"cloudflare-docs": {
				type: "remote",
				url: "https://docs.mcp.cloudflare.com/mcp",
			},
		},
	};

	await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

	return configPath;
}
