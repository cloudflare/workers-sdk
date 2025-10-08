import fs from "node:fs";
import path from "node:path";

export interface AssetDirectorySuggestion {
	directory: string;
	reason: string;
}

const COMMON_ASSET_DIRECTORIES = [
	{ name: "dist", reason: "common build output directory" },
	{ name: "build", reason: "common build output directory" },
	{ name: "out", reason: "common build output directory" },
	{ name: "public", reason: "common static assets directory" },
	{ name: ".next/out", reason: "Next.js static export output directory" },
	{ name: "_site", reason: "Jekyll/11ty output directory" },
];

const FRAMEWORK_CONFIGS: Array<{
	configFile: string;
	parseConfig?: (content: string) => string | null;
	defaultOutDir?: string;
}> = [
	{
		configFile: "package.json",
		parseConfig: (content: string) => {
			try {
				const pkg = JSON.parse(content);
				// Check for common frameworks and their typical output directories
				if (pkg.dependencies?.astro || pkg.devDependencies?.astro) {
					return "dist";
				}
				if (pkg.dependencies?.vite || pkg.devDependencies?.vite) {
					return "dist";
				}
				if (pkg.dependencies?.next || pkg.devDependencies?.next) {
					return "out"; // for static exports
				}
				if (pkg.dependencies?.["@11ty/eleventy"] || pkg.devDependencies?.["@11ty/eleventy"]) {
					return "_site";
				}
			} catch {
				// Ignore JSON parse errors
			}
			return null;
		},
	},
	{
		configFile: "astro.config.mjs",
		defaultOutDir: "dist",
	},
	{
		configFile: "astro.config.js",
		defaultOutDir: "dist",
	},
	{
		configFile: "astro.config.ts",
		defaultOutDir: "dist",
	},
	{
		configFile: "vite.config.js",
		defaultOutDir: "dist",
	},
	{
		configFile: "vite.config.ts",
		defaultOutDir: "dist",
	},
	{
		configFile: "next.config.js",
		defaultOutDir: "out",
	},
	{
		configFile: "next.config.mjs",
		defaultOutDir: "out",
	},
	{
		configFile: ".eleventy.js",
		defaultOutDir: "_site",
	},
	{
		configFile: "eleventy.config.js",
		defaultOutDir: "_site",
	},
];

export function detectStaticAssetDirectories(projectRoot: string = process.cwd()): AssetDirectorySuggestion[] {
	const suggestionsMap = new Map<string, AssetDirectorySuggestion>();

	// Check framework-specific configurations first (they have priority)
	for (const { configFile, parseConfig, defaultOutDir } of FRAMEWORK_CONFIGS) {
		const configPath = path.join(projectRoot, configFile);
		if (fs.existsSync(configPath)) {
			let suggestedDir: string | null = null;

			if (parseConfig) {
				try {
					const content = fs.readFileSync(configPath, "utf-8");
					suggestedDir = parseConfig(content);
				} catch {
					// Ignore read/parse errors
				}
			} else if (defaultOutDir) {
				suggestedDir = defaultOutDir;
			}

			if (suggestedDir) {
				const dirPath = path.join(projectRoot, suggestedDir);
				if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
					try {
						const files = fs.readdirSync(dirPath);
						if (files.length > 0) {
							const reason = `detected ${configFile.replace(/\.(js|mjs|ts)$/, "")} project`;
							suggestionsMap.set(`./${suggestedDir}`, {
								directory: `./${suggestedDir}`,
								reason,
							});
						}
					} catch {
						// Ignore read errors
					}
				}
			}
		}
	}

	// Then check for common asset directories (lower priority)
	for (const { name, reason } of COMMON_ASSET_DIRECTORIES) {
		const directory = `./${name}`;
		// Only add if not already detected by framework-specific logic
		if (!suggestionsMap.has(directory)) {
			const dirPath = path.join(projectRoot, name);
			if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
				// Check if directory has files (not empty)
				try {
					const files = fs.readdirSync(dirPath);
					if (files.length > 0) {
						suggestionsMap.set(directory, {
							directory,
							reason,
						});
					}
				} catch {
					// Ignore read errors
				}
			}
		}
	}

	// Convert map to array and sort by directory name to ensure consistent ordering
	return Array.from(suggestionsMap.values()).sort((a, b) => a.directory.localeCompare(b.directory));
}