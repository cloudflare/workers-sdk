import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { rest } from "msw";
import { msw } from "../helpers/msw";
import type { CloudchamberConfig } from "../../config/environment";

export function setWranglerConfig(cloudchamber: CloudchamberConfig) {
	fs.writeFileSync(
		"./wrangler.toml",
		TOML.stringify({
			name: "my-container",
			cloudchamber: { ...cloudchamber },
		}),

		"utf-8"
	);
}

export function mockAccount() {
	msw.use(
		rest.get("*/me", async (request, response, context) => {
			return response.once(context.json({}));
		})
	);
}
