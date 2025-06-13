import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { http, HttpResponse } from "msw";
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
		http.get(
			"*/me",
			async () => {
				return HttpResponse.json({
					external_account_id: "test_account_id",
					limits: {
						disk_mb_per_deployment: 2000,
					},
				});
			},
			{ once: true }
		)
	);
}
