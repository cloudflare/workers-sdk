import * as fs from "fs";
import TOML from "@iarna/toml";
import type { RawConfig } from "../../config";

/** Write a mock wrangler.toml file to disk. */
export function writeWranglerToml(
	config: RawConfig = {},
	path = "./wrangler.toml"
) {
	fs.writeFileSync(
		path,
		TOML.stringify({
			compatibility_date: "2022-01-12",
			name: "test-name",
			...(config as TOML.JsonMap),
		}),
		"utf-8"
	);
}

export function writeWranglerJson(
	config: RawConfig = {},
	path = "./wrangler.json"
) {
	fs.writeFileSync(
		path,
		JSON.stringify({
			compatibility_date: "2022-01-12",
			name: "test-name",
			...config,
		}),

		"utf-8"
	);
}
