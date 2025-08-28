import fs from "node:fs/promises";
import path from "node:path";
import { getBasePath, getWranglerTmpDir } from "../paths";
import type { OpencodeConfig } from "./types";

export async function generateOpencodeConfig(
	projectPath: string
): Promise<string> {
	const tempDir = getWranglerTmpDir(projectPath, "opencode");
	const configPath = path.join(tempDir.path, "opencode.json");

	const config: OpencodeConfig = {
		$schema: "https://opencode.ai/config.json",
		plugin: [path.resolve(getBasePath(), "src/prompt/opencode-plugin.js")],
	};

	await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

	return configPath;
}
