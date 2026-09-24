import path from "node:path";
import {
	experimental_readRawConfig,
	type RawConfig,
} from "@cloudflare/workers-utils";
import { glob } from "tinyglobby";

const SECRET_FILE_PATTERNS = [
	"**/.*.vars.*",
	"**/.*.vars",
	"**/.dev.vars.*",
	"**/.dev.vars",
	"**/.env.*",
	"**/.env",
] satisfies string[];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readWranglerConfig(configPath: string): RawConfig {
	if (
		!configPath.endsWith(".toml") &&
		!configPath.endsWith(".json") &&
		!configPath.endsWith(".jsonc")
	) {
		throw new Error(
			`Unsupported Wrangler config format for ${configPath}. Expected .json, .jsonc, or .toml.`
		);
	}

	const { rawConfig } = experimental_readRawConfig({ config: configPath });
	if (!isRecord(rawConfig)) {
		throw new Error(`Wrangler config must contain an object: ${configPath}`);
	}

	return rawConfig;
}

export async function findSecretFiles(
	projectDirectory: string
): Promise<string[]> {
	const files = await glob(SECRET_FILE_PATTERNS, {
		cwd: projectDirectory,
		dot: true,
		ignore: ["**/.git/**", "**/.wrangler/**", "**/node_modules/**"],
		onlyFiles: true,
	});
	return files.map((filePath) => path.normalize(filePath)).sort();
}
