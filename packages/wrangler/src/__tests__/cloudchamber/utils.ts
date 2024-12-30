import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { http, HttpResponse } from "msw";
import { msw } from "../helpers/msw";
import type { CloudchamberConfig } from "../../../../wrangler-shared/src/config/environment";

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
		http.get(
			"*/me",
			async () => {
				return HttpResponse.json({});
			},
			{ once: true }
		)
	);
}
