import * as fs from "node:fs";
import { dirname } from "node:path";
import { formatConfigSnippet } from "../../config";
import type { RawConfig } from "../../config";

/** Write a mock wrangler config file to disk. */
export function writeWranglerConfig(
	config: RawConfig = {},
	path = "./wrangler.toml"
) {
	fs.mkdirSync(dirname(path), { recursive: true });
	fs.writeFileSync(
		path,
		formatConfigSnippet(
			{
				compatibility_date: "2022-01-12",
				name: "test-name",
				...config,
			},
			path
		),
		"utf-8"
	);
}
