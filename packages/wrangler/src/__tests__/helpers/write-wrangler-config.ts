import * as fs from "node:fs";
import { dirname, relative } from "node:path";
import {
	formatConfigSnippet,
	parseJSONC,
	parseTOML,
	PATH_TO_DEPLOY_CONFIG,
	readFileSync,
} from "@cloudflare/workers-utils";
import type { RawConfig, RedirectedRawConfig } from "@cloudflare/workers-utils";

/** Write a mock wrangler config file to disk. */
export function writeWranglerConfig(
	config: RawConfig = {},
	path = "./wrangler.toml"
) {
	const json = /\.jsonc?$/.test(path);
	fs.mkdirSync(dirname(path), { recursive: true });
	fs.writeFileSync(
		path,
		formatConfigSnippet(
			{
				compatibility_date: "2022-01-12",
				name: "test-name",
				...config,
			},
			path,
			!!json
		),
		"utf-8"
	);
}

export function writeRedirectedWranglerConfig(
	config: RedirectedRawConfig,
	path = "./dist/wrangler.json"
) {
	const json = /\.jsonc?$/.test(path);
	fs.mkdirSync(dirname(path), { recursive: true });
	fs.writeFileSync(
		path,
		formatConfigSnippet(
			{
				compatibility_date: "2022-01-12",
				name: "test-name",
				...config,
			},
			path,
			!!json
		),
		"utf-8"
	);
	writeDeployRedirectConfig(path);
}

export function writeDeployRedirectConfig(configPath: string) {
	const config: RedirectedRawConfig = {
		configPath: relative(dirname(PATH_TO_DEPLOY_CONFIG), configPath),
	};
	fs.mkdirSync(dirname(PATH_TO_DEPLOY_CONFIG), { recursive: true });
	fs.writeFileSync(
		PATH_TO_DEPLOY_CONFIG,
		formatConfigSnippet(config, ".json", true),
		"utf-8"
	);
}

export function readWranglerConfig(path = "./wrangler.toml"): RawConfig {
	if (path.endsWith(".toml")) {
		return parseTOML(readFileSync(path), path) as RawConfig;
	}

	if (path.endsWith(".json") || path.endsWith(".jsonc")) {
		return parseJSONC(readFileSync(path), path) as RawConfig;
	}

	return {};
}
